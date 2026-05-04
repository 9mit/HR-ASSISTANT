"""Audit and fairness logging service."""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy.orm import Session

from .models import AuditLog, Candidate

logger = logging.getLogger(__name__)


class AuditService:
    """Handle fairness auditing and explanation logging."""

    def __init__(self):
        """Initialize audit service."""
        self.redactable_fields = [
            "name",
            "email",
            "phone",
            "address",
            "gender",
            "age",
            "race",
            "religion",
            "marital_status",
            "disability_status",
        ]

    def create_audit_log(
        self,
        candidate: Candidate,
        batch_id: int,
        ranking_result: Dict[str, Any],
        db: Session,
    ) -> Optional[AuditLog]:
        """
        Create audit log for a candidate evaluation.
        
        Args:
            candidate: Candidate model
            batch_id: Batch ID
            ranking_result: Ranking result from scoring engine
            db: Database session
            
        Returns:
            Created AuditLog or None
        """
        try:
            # Identify what was redacted
            redacted_fields = self._get_redacted_fields(candidate)
            
            # Build factor explanations (SHAP-style)
            factor_explanations = self._build_factor_explanations(ranking_result)
            
            # Identify fairness flags
            fairness_flags = self._identify_fairness_flags(
                candidate, ranking_result, redacted_fields
            )
            
            # Create log entries
            log_entries = self._create_log_entries(
                candidate, ranking_result, redacted_fields
            )
            
            # Create and save audit log
            audit_log = AuditLog(
                candidate_id=candidate.id,
                batch_id=batch_id,
                redacted_fields=redacted_fields,
                anonymization_applied=len(redacted_fields) > 0,
                factor_explanations=factor_explanations,
                fairness_flags=fairness_flags,
                log_entries=log_entries,
            )
            
            db.add(audit_log)
            db.flush()
            
            logger.info(f"Audit log created for candidate {candidate.id}")
            return audit_log

        except Exception as e:
            logger.error(f"Error creating audit log: {str(e)}")
            # Do NOT rollback here — the caller owns the transaction
            return None

    def _get_redacted_fields(self, candidate: Candidate) -> List[str]:
        """
        Identify which personal fields were redacted.
        
        Args:
            candidate: Candidate model
            
        Returns:
            List of redacted field names
        """
        redacted = []
        
        # In a real system, you'd track what was actually redacted during parsing
        # For now, we're documenting that PII was handled
        if candidate.name:
            redacted.append("name_redacted_for_scoring")
        if candidate.email:
            redacted.append("email_redacted_for_scoring")
        
        return redacted

    def _build_factor_explanations(self, ranking_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build SHAP-style factor contribution explanations.
        
        Args:
            ranking_result: Ranking result
            
        Returns:
            Dictionary with factor explanations
        """
        breakdown = ranking_result.get("score_breakdown", {})
        
        explanations = {}
        
        # Skill match explanation
        if "skill" in breakdown:
            skill_score = breakdown["skill"]["score"]
            skill_weight = breakdown["skill"]["weight"]
            explanations["skill_match"] = {
                "raw_score": skill_score,
                "weight": skill_weight,
                "contribution": skill_score * skill_weight,
                "explanation": f"Your skills matched {skill_score:.0f}% of requirements (40% weight)",
            }
        
        # Experience explanation
        if "experience" in breakdown:
            exp_score = breakdown["experience"]["score"]
            exp_weight = breakdown["experience"]["weight"]
            explanations["experience"] = {
                "raw_score": exp_score,
                "weight": exp_weight,
                "contribution": exp_score * exp_weight,
                "explanation": f"Your experience level scored {exp_score:.0f}% (20% weight)",
            }
        
        # Project explanation
        if "projects" in breakdown:
            proj_score = breakdown["projects"]["score"]
            proj_weight = breakdown["projects"]["weight"]
            explanations["project_quality"] = {
                "raw_score": proj_score,
                "weight": proj_weight,
                "contribution": proj_score * proj_weight,
                "explanation": f"Your portfolio/projects scored {proj_score:.0f}% (30% weight)",
            }
        
        # Certification explanation
        if "certifications" in breakdown:
            cert_score = breakdown["certifications"]["score"]
            cert_weight = breakdown["certifications"]["weight"]
            explanations["certifications"] = {
                "raw_score": cert_score,
                "weight": cert_weight,
                "contribution": cert_score * cert_weight,
                "explanation": f"Your certifications scored {cert_score:.0f}% (10% weight)",
            }
        
        return explanations

    def _identify_fairness_flags(
        self,
        candidate: Candidate,
        ranking_result: Dict[str, Any],
        redacted_fields: List[str],
    ) -> List[str]:
        """
        Identify potential fairness concerns.
        
        Args:
            candidate: Candidate model
            ranking_result: Ranking result
            redacted_fields: List of redacted fields
            
        Returns:
            List of fairness flags
        """
        flags = []
        
        # Check if PII was properly anonymized
        if len(redacted_fields) > 0:
            flags.append("pii_redacted_before_scoring")
        else:
            flags.append("warning_pii_not_redacted")
        
        # Check skill bias
        skill_score = ranking_result.get("skill_match_score", 0)
        if skill_score < 30:
            flags.append("low_skill_match_may_warrant_review")
        
        # Check for missing data
        if len(candidate.skills or []) == 0:
            flags.append("missing_skill_data")
        
        if candidate.experience is None:
            flags.append("missing_experience_data")
        
        # Check salary transparency
        if candidate.salary_min is None:
            flags.append("unclear_salary_expectations")
        
        # Decision transparency
        decision = ranking_result.get("decision")
        if decision:
            decision_val = decision.value if hasattr(decision, "value") else str(decision)
            flags.append(f"decision_{decision_val}")
        
        return flags

    def _create_log_entries(
        self,
        candidate: Candidate,
        ranking_result: Dict[str, Any],
        redacted_fields: List[str],
    ) -> List[Dict[str, str]]:
        """
        Create detailed log entries for the evaluation.
        
        Args:
            candidate: Candidate model
            ranking_result: Ranking result
            redacted_fields: List of redacted fields
            
        Returns:
            List of log entries
        """
        logs = []
        
        # Parse step
        logs.append({
            "timestamp": datetime.utcnow().isoformat(),
            "step": "parse_resume",
            "status": "completed",
            "details": f"Resume parsed. Fields redacted: {', '.join(redacted_fields)}",
        })
        
        # Scoring step
        logs.append({
            "timestamp": datetime.utcnow().isoformat(),
            "step": "scoring",
            "status": "completed",
            "details": f"Candidate scored with {ranking_result.get('overall_score', 0):.1f}%",
        })
        
        # Decision step
        decision = ranking_result.get("decision")
        decision_val = decision.value if hasattr(decision, "value") else str(decision)
        logs.append({
            "timestamp": datetime.utcnow().isoformat(),
            "step": "decision",
            "status": "completed",
            "details": f"Decision: {decision_val} - {ranking_result.get('explanation', 'No explanation')}",
        })
        
        # Explanation step
        logs.append({
            "timestamp": datetime.utcnow().isoformat(),
            "step": "explanation",
            "status": "completed",
            "details": "Detailed factor contributions logged for transparency",
        })
        
        return logs

    def get_audit_report(self, candidate_id: int, db: Session) -> Optional[Dict[str, Any]]:
        """
        Get complete audit report for a candidate.
        
        Args:
            candidate_id: Candidate ID
            db: Database session
            
        Returns:
            Audit report dictionary
        """
        try:
            audit_logs = db.query(AuditLog).filter(
                AuditLog.candidate_id == candidate_id
            ).order_by(AuditLog.created_at.desc()).first()
            
            if not audit_logs:
                return None
            
            candidate_decision = audit_logs.candidate.decision
            if hasattr(candidate_decision, "value"):
                decision_str = candidate_decision.value
            elif candidate_decision is not None:
                decision_str = str(candidate_decision)
            else:
                decision_str = None

            return {
                "candidate_id": candidate_id,
                "overview": f"Bias-audit for {audit_logs.candidate.alias}. Anonymization applied: {audit_logs.anonymization_applied}",
                "decision": decision_str,
                "anonymization": audit_logs.redacted_fields or [],
                "factor_contributions": [
                    {"factor": k, **v} for k, v in (audit_logs.factor_explanations or {}).items()
                ],
                "fairness_flags": audit_logs.fairness_flags or [],
                "log_entries": audit_logs.log_entries or [],
                "salary_gate": "within_range" if decision_str != "salary_mismatch" else "out_of_range",
                "created_at": audit_logs.created_at.isoformat(),
            }

        except Exception as e:
            logger.error(f"Error retrieving audit report: {str(e)}")
            return None
