"""Email service for sending candidate communications.

Supports two providers:
1. **Resend** (SaaS mode) — Platform-level transactional email. Zero config for HR users.
   Emails are sent from TalentLens's own domain (e.g., notifications@talentlens.app).
   Free tier: 3,000 emails/month at https://resend.com
2. **SMTP** (self-hosted mode) — For companies that want to send from their own domain.
"""
import logging
import smtplib
import uuid
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Optional
from datetime import datetime

import httpx

from .settings import settings
from .models import Email, Candidate

logger = logging.getLogger(__name__)

# ============ Email Templates ============

REJECTION_TEMPLATE = """Dear {candidate_name},

Thank you for your interest in the {job_title} position at {company_name}. After careful consideration of your application, we have decided to move forward with other candidates whose qualifications more closely match our current needs.

We appreciate the time you invested in our process and encourage you to apply for future openings that align with your skills and experience.

Best regards,
{company_name} Hiring Team"""

SHORTLIST_TEMPLATE = """Dear {candidate_name},

Congratulations! We are pleased to inform you that your application for the {job_title} position at {company_name} has been selected to move forward in our hiring process.

We were impressed by your background and qualifications. Our hiring team would like to schedule a discussion to learn more about your experience and explore how you could contribute to our team.

Please reply to this email with your availability for a call in the coming week.

Best regards,
{company_name} Hiring Team"""

REVIEW_TEMPLATE = """Dear {candidate_name},

Thank you for applying for the {job_title} position at {company_name}. Your application is currently under review by our hiring team.

We will be in touch with next steps within the next 2 weeks.

Best regards,
{company_name} Hiring Team"""

CLARIFICATION_TEMPLATE = """Dear {candidate_name},

Thank you for your interest in the {job_title} position at {company_name}. We would like to clarify a few details from your application before proceeding with our evaluation.

Could you please provide the following information:
- Your current salary expectations
- Availability for the role

Please reply to this email with this information.

Best regards,
{company_name} Hiring Team"""

DECISION_TEMPLATES = {
    "shortlist": {"template": SHORTLIST_TEMPLATE, "subject": "Congratulations! Your Application for {job_title}"},
    "review": {"template": REVIEW_TEMPLATE, "subject": "Application Update — {job_title}"},
    "rejected": {"template": REJECTION_TEMPLATE, "subject": "Your Application for {job_title}"},
    "needs_clarification": {"template": CLARIFICATION_TEMPLATE, "subject": "Additional Information Needed — {job_title}"},
}


class EmailService:
    """Handle email communication with candidates.
    
    Automatically selects the best available provider:
    1. Resend API (SaaS mode — zero config for HR users)
    2. SMTP (self-hosted mode)
    3. Draft mode (no email provider configured — saves to DB only)
    """

    def __init__(self):
        self.smtp_server = settings.SMTP_SERVER
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.smtp_from_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME
        self.resend_api_key = settings.RESEND_API_KEY
        self.platform_from_email = settings.PLATFORM_FROM_EMAIL
        self.company_name = settings.PLATFORM_COMPANY_NAME

    # ============ Provider Detection ============

    def _has_resend(self) -> bool:
        """Check if Resend API is configured (SaaS mode)."""
        return bool(self.resend_api_key)

    def _has_smtp(self) -> bool:
        """Check if SMTP is configured (self-hosted mode)."""
        return bool(self.smtp_username and self.smtp_password and self.smtp_server)

    def is_configured(self) -> bool:
        """Check if ANY email provider is available."""
        return self._has_resend() or self._has_smtp()

    def get_provider_name(self) -> str:
        if self._has_resend():
            return "resend"
        if self._has_smtp():
            return "smtp"
        return "none"

    def get_email_status(self) -> Dict[str, Any]:
        """Return email configuration status for the frontend."""
        provider = self.get_provider_name()
        return {
            "configured": self.is_configured(),
            "provider": provider,
            "from_email": (
                self.platform_from_email if provider == "resend"
                else self.smtp_from_email if provider == "smtp"
                else None
            ),
            "note": (
                "Platform email is active. All candidate emails are sent automatically."
                if provider == "resend"
                else "SMTP email is active. Emails will be sent from your configured address."
                if provider == "smtp"
                else "No email provider configured. Emails will be saved as drafts. Ask your admin to add RESEND_API_KEY."
            ),
        }

    # ============ Send via Best Available Provider ============

    def _send(self, recipient: str, subject: str, body: str, reply_to: str | None = None, from_name: str | None = None) -> bool:
        """Send email using the best available provider."""
        if not recipient or "@" not in recipient:
            logger.warning(f"Invalid recipient email: {recipient}")
            return False

        if self._has_resend():
            return self._send_resend(recipient, subject, body, reply_to=reply_to, from_name=from_name)
        if self._has_smtp():
            return self._send_smtp(recipient, subject, body, reply_to=reply_to)
        
        logger.warning("No email provider configured, email will be saved as draft")
        return False

    def _send_resend(self, recipient: str, subject: str, body: str, reply_to: str | None = None, from_name: str | None = None) -> bool:
        """Send email via Resend API (SaaS mode — zero config for HR).
        
        When HR provides their email, it is used as the reply-to address
        so candidates reply directly to the HR, not to the platform.
        """
        try:
            # Build the from address: use HR name if provided
            from_addr = self.platform_from_email
            if from_name:
                # Dynamically extract the email address part from the configured platform email
                if "<" in self.platform_from_email and ">" in self.platform_from_email:
                    email_part = self.platform_from_email[self.platform_from_email.find("<"):self.platform_from_email.find(">")+1]
                else:
                    email_part = f"<{self.platform_from_email}>"
                
                # e.g. "Priya Sharma via TalentLens <onboarding@resend.dev>"
                from_addr = f"{from_name} via {self.platform_company_name} {email_part}"

            payload: dict = {
                "from": from_addr,
                "to": [recipient],
                "subject": subject,
                "text": body,
            }
            if reply_to:
                payload["reply_to"] = reply_to

            response = httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {self.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=10,
            )
            if response.status_code in (200, 201):
                resend_id = response.json().get("id", "unknown")
                logger.info(f"Email sent via Resend to {recipient} (ID: {resend_id})")
                return True
            else:
                logger.error(f"Resend API error {response.status_code}: {response.text}")
                return False
        except Exception as e:
            logger.error(f"Resend send failed: {e}")
            return False

    def _send_smtp(self, recipient: str, subject: str, body: str, reply_to: str | None = None) -> bool:
        """Send email via SMTP (self-hosted mode)."""
        if not self.smtp_username or not self.smtp_password:
            logger.warning("SMTP credentials not configured, skipping send")
            return False
        
        try:
            msg = MIMEMultipart()
            msg["From"] = self.smtp_from_email or self.smtp_username
            msg["To"] = recipient
            msg["Subject"] = subject
            if reply_to:
                msg["Reply-To"] = reply_to
            msg.attach(MIMEText(body, "plain"))
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port, timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)
            
            logger.info(f"Email sent via SMTP to {recipient}")
            return True
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP auth failed: {e}. Use App Password for Gmail.")
            return False
        except Exception as e:
            logger.error(f"SMTP error sending to {recipient}: {e}")
            return False

    # ============ Public API ============

    def send_auto_email(
        self,
        *,
        candidate_name: str,
        candidate_email: str,
        candidate_id: int,
        decision: str,
        job_title: str,
        company_name: str | None = None,
        hr_email: str | None = None,
        hr_name: str | None = None,
        db=None,
    ) -> Dict[str, Any]:
        """
        Automatically send the appropriate email based on candidate decision.
        Called by the pipeline when auto_send_emails=True.

        Args:
            candidate_name: Candidate's name (or alias)
            candidate_email: Extracted email address
            candidate_id: DB ID
            decision: shortlist / rejected / review / needs_clarification
            job_title: Role being hired for
            company_name: Override company name (or uses platform default)
            db: Database session for logging

        Returns:
            Result dict with status
        """
        transaction_id = f"TL-{uuid.uuid4().hex[:8].upper()}"
        co_name = company_name or self.company_name

        # Get the right template
        template_info = DECISION_TEMPLATES.get(decision)
        if not template_info:
            return {"success": False, "status": "skipped", "reason": f"No template for decision: {decision}"}

        # Render
        subject = template_info["subject"].format(job_title=job_title)
        body = template_info["template"].format(
            candidate_name=candidate_name or "Candidate",
            job_title=job_title,
            company_name=co_name,
        )

        # Send — with HR's email as reply-to so candidates reply directly to the HR
        if not candidate_email or "@" not in candidate_email:
            status = "no_email"
            sent = False
        else:
            sent = self._send(
                candidate_email, subject, body,
                reply_to=hr_email,
                from_name=hr_name,
            )
            status = "sent" if sent else "draft"

        # Log to DB
        if db:
            try:
                email_record = Email(
                    candidate_id=candidate_id,
                    recipient_email=candidate_email or "no-email@extracted",
                    subject=subject,
                    body=body,
                    email_type=decision,
                    status=status,
                    sent_at=datetime.utcnow() if sent else None,
                )
                db.add(email_record)
                db.flush()
            except Exception as e:
                logger.warning(f"Failed to log email record: {e}")

        return {
            "success": sent,
            "status": status,
            "transactionId": transaction_id,
            "subject": subject,
            "body": body,
            "message": (
                f"Email sent to {candidate_email}"
                if sent
                else f"Email saved as draft (no email provider)"
                if status == "draft"
                else f"No email address found for this candidate"
            ),
        }

    def send_custom_email(
        self,
        *,
        candidate_id: int,
        recipient_email: str,
        subject: str,
        body: str,
        db,
    ) -> Dict[str, Any]:
        """
        Send a custom email from the frontend email panel.
        Dispatches via the best available provider.
        """
        transaction_id = f"TL-{uuid.uuid4().hex[:8].upper()}"
        should_send = self.is_configured() and recipient_email and "@" in recipient_email

        sent = False
        if should_send:
            sent = self._send(recipient_email, subject, body)

        status = "sent" if sent else ("draft" if not should_send else "failed")

        # Log to DB
        email_record = Email(
            candidate_id=candidate_id,
            recipient_email=recipient_email or "unknown@placeholder.local",
            subject=subject,
            body=body,
            email_type="manual",
            status=status,
            sent_at=datetime.utcnow() if sent else None,
        )
        db.add(email_record)
        db.commit()

        return {
            "success": sent,
            "status": status,
            "message": (
                "Email dispatched successfully"
                if sent
                else "Email saved as draft (no provider configured)"
                if status == "draft"
                else "Email sending failed — check email configuration"
            ),
            "transactionId": transaction_id,
        }

    def send_rejection_email(self, candidate: Candidate, db) -> Dict[str, Any]:
        """Generate a rejection email draft (used during batch processing)."""
        try:
            job_title = candidate.batch.job_title if candidate.batch else "Position"
        except Exception:
            job_title = "Position"

        body = REJECTION_TEMPLATE.format(
            candidate_name=candidate.alias or candidate.name or "Candidate",
            job_title=job_title,
            company_name=self.company_name,
        )
        subject = f"Your Application for {job_title}"

        return {
            "subject": subject,
            "body": body,
            "status": "draft",
            "recipient": candidate.email or "unknown",
        }
