"""SQLAlchemy ORM models for PostgreSQL."""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, JSON, Text, Enum, Boolean, Index
from sqlalchemy.orm import relationship

from .database import Base


class RankingDecision(str, PyEnum):
    """Ranking decision enum."""
    SHORTLIST = "shortlist"
    REVIEW = "review"
    REJECTED = "rejected"
    NEEDS_CLARIFICATION = "needs_clarification"
    UNDER_CONSIDERATION = "under_consideration"


class Candidate(Base):
    """Candidate model."""
    __tablename__ = "candidates"
    
    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    alias = Column(String(255), nullable=False)
    name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    score = Column(Float, nullable=True)
    decision = Column(String(50), nullable=True)
    
    # Parsed resume data (JSON)
    education = Column(JSON, nullable=True)
    experience = Column(JSON, nullable=True)
    skills = Column(JSON, nullable=True)
    certifications = Column(JSON, nullable=True)
    
    # Cache for the full frontend record
    raw_record = Column(JSON, nullable=True)
    
    # GitHub/Portfolio
    github_url = Column(String(255), nullable=True)
    portfolio_url = Column(String(255), nullable=True)
    
    # Salary expectations
    salary_min = Column(Float, nullable=True)
    salary_max = Column(Float, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    batch = relationship("Batch", back_populates="candidates")
    projects = relationship("Project", back_populates="candidate", cascade="all, delete-orphan")
    rankings = relationship("Ranking", back_populates="candidate", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="candidate", cascade="all, delete-orphan")
    emails = relationship("Email", back_populates="candidate", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="candidate", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("idx_batch_id", "batch_id"),
        Index("idx_decision", "decision"),
        Index("idx_score", "score"),
    )


class Batch(Base):
    """Batch/Job posting model."""
    __tablename__ = "batches"
    
    id = Column(Integer, primary_key=True, index=True)
    job_title = Column(String(255), nullable=False)
    job_description = Column(Text, nullable=True)
    salary_min = Column(Float, nullable=True)
    salary_max = Column(Float, nullable=True)
    required_skills = Column(JSON, nullable=True)
    preferred_skills = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    candidates = relationship("Candidate", back_populates="batch", cascade="all, delete-orphan")


class Project(Base):
    """GitHub/Portfolio project model."""
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    
    url = Column(String(500), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    language = Column(String(50), nullable=True)
    stars = Column(Integer, default=0)
    forks = Column(Integer, default=0)
    readme_quality_score = Column(Float, default=0.0)
    commit_frequency = Column(String(50), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    candidate = relationship("Candidate", back_populates="projects")
    
    __table_args__ = (
        Index("idx_candidate_id", "candidate_id"),
    )


class Ranking(Base):
    """Ranking/Scoring model."""
    __tablename__ = "rankings"
    
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    
    # Scores
    skill_match_score = Column(Float, default=0.0)
    experience_score = Column(Float, default=0.0)
    project_quality_score = Column(Float, default=0.0)
    overall_score = Column(Float, default=0.0)
    
    # Detailed breakdown (JSON)
    score_breakdown = Column(JSON, nullable=True)
    decision = Column(String(50), nullable=False)
    explanation = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    candidate = relationship("Candidate", back_populates="rankings")
    
    __table_args__ = (
        Index("idx_candidate_batch", "candidate_id", "batch_id"),
        Index("idx_batch_decision", "batch_id", "decision"),
    )


class AuditLog(Base):
    """Fairness/Bias audit log model."""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    
    # What was redacted/anonymized
    redacted_fields = Column(JSON, nullable=True)
    anonymization_applied = Column(Boolean, default=True)
    
    # Factor contributions (SHAP-style explanation)
    factor_explanations = Column(JSON, nullable=True)
    
    # Logging
    log_entries = Column(JSON, nullable=True)
    fairness_flags = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    candidate = relationship("Candidate", back_populates="audit_logs")
    
    __table_args__ = (
        Index("idx_candidate_batch_audit", "candidate_id", "batch_id"),
    )


class Email(Base):
    """Email communication history model."""
    __tablename__ = "emails"
    
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    
    recipient_email = Column(String(255), nullable=False)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    email_type = Column(String(50), nullable=False)  # rejection, shortlist, etc.
    status = Column(String(50), default="draft")  # draft, queued, sent, failed
    
    sent_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    candidate = relationship("Candidate", back_populates="emails")
    
    __table_args__ = (
        Index("idx_candidate_email", "candidate_id"),
        Index("idx_status", "status"),
    )


class Note(Base):
    """HR notes/annotations model."""
    __tablename__ = "notes"
    
    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    
    content = Column(Text, nullable=False)
    created_by = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    candidate = relationship("Candidate", back_populates="notes")
    
    __table_args__ = (
        Index("idx_candidate_notes", "candidate_id"),
    )
