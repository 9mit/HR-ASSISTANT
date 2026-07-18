import logging
import asyncio
from datetime import datetime, timezone
import aiosmtplib
from email.message import EmailMessage
from sqlalchemy.orm import Session
from typing import Optional

from .settings import settings
from .models import Email, Candidate

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.use_resend = bool(settings.RESEND_API_KEY)
        self.use_smtp = bool(settings.SMTP_SERVER and settings.SMTP_USERNAME and settings.SMTP_PASSWORD)

    @property
    def is_configured(self) -> bool:
        """True when a real outbound email provider is configured."""
        return self.use_resend or self.use_smtp

    async def send_email(self, candidate_id: int, recipient_email: str, subject: str, body: str, email_type: str, db: Session) -> Optional[Email]:
        """Send an email using configured backend (Resend or SMTP)."""
        if not recipient_email:
            logger.warning(f"No recipient email for candidate {candidate_id}")
            return None

        # Create email record
        email_record = Email(
            candidate_id=candidate_id,
            recipient_email=recipient_email,
            subject=subject,
            body=body,
            email_type=email_type,
            status="queued"
        )
        db.add(email_record)
        db.commit()
        db.refresh(email_record)

        # Decide which service to use
        try:
            if self.use_resend:
                await self._send_via_resend(recipient_email, subject, body)
            elif self.use_smtp:
                await self._send_via_smtp(recipient_email, subject, body)
            else:
                # Persist as draft when outbound email is not configured
                logger.info(f"Email provider not configured; drafting to {recipient_email}: {subject}")
                email_record.status = "draft"
                db.commit()
                return email_record

            # Update status
            email_record.status = "sent"
            email_record.sent_at = datetime.now(timezone.utc)
        except Exception as e:
            logger.error(f"Failed to send email to {recipient_email}: {str(e)}")
            email_record.status = "failed"
            email_record.error_message = str(e)
        finally:
            db.commit()

        return email_record

    async def _send_via_smtp(self, recipient: str, subject: str, body: str):
        message = EmailMessage()
        message["From"] = settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(body)

        # Protect against hung connection with asyncio.wait_for and aiosmtplib timeout parameter
        await asyncio.wait_for(
            aiosmtplib.send(
                message,
                hostname=settings.SMTP_SERVER,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USERNAME,
                password=settings.SMTP_PASSWORD,
                use_tls=(settings.SMTP_PORT == 465),
                start_tls=(settings.SMTP_PORT == 587),
                timeout=10.0,
            ),
            timeout=12.0
        )

    async def _send_via_resend(self, recipient: str, subject: str, body: str):
        import httpx
        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "from": settings.PLATFORM_FROM_EMAIL,
            "to": [recipient],
            "subject": subject,
            "text": body
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()

email_service = EmailService()
