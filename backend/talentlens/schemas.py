"""Pydantic schemas for API validation and response serialization."""
from __future__ import annotations
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from enum import Enum as PyEnum


class RankingDecision(str, PyEnum):
    """Ranking decision enum."""
    SHORTLIST = "shortlist"
    REVIEW = "review"
    REJECTED = "rejected"
    NEEDS_CLARIFICATION = "needs_clarification"
    SALARY_MISMATCH = "salary_mismatch"
    INVALID = "invalid"
    UNDER_CONSIDERATION = "under_consideration"


Decision = Literal["shortlist", "review", "rejected", "needs_clarification", "salary_mismatch", "invalid", "under_consideration"]
SalaryStatus = Literal["within_range", "missing_expectation", "out_of_range", "unknown"]


# ============ Request Schemas ============

class SetTargetRequest(BaseModel):
    """Schema for setting target job role."""
    job_title: str = Field(..., min_length=1, max_length=200, description="Target job title")
    job_description: Optional[str] = Field(None, description="Job description")
    salary_min: Optional[float] = Field(None, description="Minimum salary")
    salary_max: Optional[float] = Field(None, description="Maximum salary")
    required_skills: Optional[List[str]] = Field(None, description="Required skills")
    preferred_skills: Optional[List[str]] = Field(None, description="Preferred skills")


class SetDecisionRequest(BaseModel):
    """Schema for updating a candidate's decision."""
    decision: Decision = Field(..., description="The new decision state")


class FinalizePoolRequest(BaseModel):
    """Schema for finalizing the Talent Pool."""
    shortlisted_ids: List[str] = Field(..., description="List of string candidate IDs to shortlist")


class SaveNoteRequest(BaseModel):
    """Schema for saving HR notes (Legacy)."""
    candidate_id: int = Field(..., description="Candidate ID")
    content: str = Field(..., description="Note content")
    created_by: Optional[str] = Field(None, description="HR user who created note")


class SaveNotesRequest(BaseModel):
    """Schema for saving HR notes (Frontend)."""
    candidate_id: str = Field(..., max_length=32)
    notes: str = Field(..., max_length=10000)

    @field_validator("candidate_id")
    @classmethod
    def candidate_id_numeric(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("candidate_id must be numeric")
        return value


class SendEmailRequest(BaseModel):
    """Schema for sending any type of email."""
    candidate_id: str
    email: Optional[str] = None
    subject: str
    body: str


# ============ Base Components ============

class SalaryRange(BaseModel):
    minimum: float
    maximum: float
    currency: str = "LOCAL"


class ParsedResume(BaseModel):
    """Structured resume fields extracted from a raw upload."""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    education: Optional[str] = None
    experience_years: Optional[float] = None
    experience_summary: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    salary_expectation: Optional[float] = None
    address: Optional[str] = None
    raw_text: str = ""
    redacted_text: str = ""
    missing_info_flags: List[str] = Field(default_factory=list)
    redactions_applied: List[str] = Field(default_factory=list)


class ExperienceItem(BaseModel):
    """Experience/Employment item."""
    job_title: str
    company: str
    duration: Optional[str] = None
    description: Optional[str] = None


class EducationItem(BaseModel):
    """Education item."""
    degree: str
    institution: str
    field: Optional[str] = None
    graduation_year: Optional[int] = None


class ProjectResponse(BaseModel):
    """GitHub/Portfolio project response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    url: str
    name: str
    description: Optional[str] = None
    language: Optional[str] = None
    stars: int = 0
    forks: int = 0
    readme_quality_score: float = 0.0
    commit_frequency: Optional[str] = None


class GitHubRepo(BaseModel):
    """Specific GitHub repository data."""
    name: str
    description: Optional[str] = None
    url: Optional[str] = None
    stars: int = 0
    forks: int = 0
    commit_frequency: float = 0.0
    primary_language: Optional[str] = None
    readme_quality_score: float = 0.0


class GitHubAnalysis(BaseModel):
    """Aggregated GitHub profile analysis."""
    profile_url: Optional[str] = None
    success: bool = False
    scrape_method: str = "none"
    fallback_url: Optional[str] = None
    note: Optional[str] = None
    repos: List[GitHubRepo] = Field(default_factory=list)
    primary_languages: List[str] = Field(default_factory=list)
    project_descriptions: List[str] = Field(default_factory=list)
    aggregate_project_quality: float = 50.0


class ScoreFactor(BaseModel):
    """Individual factor in the ranking score."""
    factor: str
    weight: float
    raw_score: float
    contribution: float
    explanation: str


class LocalModelOption(BaseModel):
    """Selectable local model option exposed to the frontend."""
    model_config = ConfigDict(protected_namespaces=())

    id: str
    provider: str
    label: str
    model_name: str
    availability: str = "available"
    status: Literal["ready", "missing_key", "error"] = "ready"
    endpoint: Optional[str] = None
    description: Optional[str] = None
    supports_structured_output: bool = True


class LocalModelCatalogResponse(BaseModel):
    """List of currently reachable local model backends."""
    default_model_id: str
    models: List[LocalModelOption] = Field(default_factory=list)


# ============ Detailed Responses ============

class CandidateAudit(BaseModel):
    """Fairness and bias audit details."""
    overview: Optional[str] = None
    decision: Optional[Decision] = None
    scoring_version: Optional[str] = "v1"
    anonymization: List[str] = Field(default_factory=list)
    excluded_inputs: List[str] = Field(default_factory=list)
    matched_skills: List[str] = Field(default_factory=list)
    factor_contributions: List[ScoreFactor] = Field(default_factory=list)
    duplicate_cluster: List[str] = Field(default_factory=list)
    salary_gate: Optional[str] = None
    notes: List[str] = Field(default_factory=list)
    log_entries: List[Any] = Field(default_factory=list)


class CandidateCommunication(BaseModel):
    """Candidate-specific communication drafts."""
    subject: Optional[str] = None
    body: Optional[str] = None
    status: str


class CandidateRecord(BaseModel):
    """The main record format expected by the frontend."""
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    alias: str
    name: Optional[str] = None
    email: Optional[str] = None
    education: Optional[str] = None
    experience_years: Optional[float] = None
    experience_summary: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    salary_expectation: Optional[float] = None
    salary_status: SalaryStatus = "unknown"
    score: float = 0.0
    decision: Decision = "review"
    summary: str = ""
    missing_info_flags: List[str] = Field(default_factory=list)
    interview_questions: List[str] = Field(default_factory=list)
    communication: Optional[CandidateCommunication] = None
    audit: Optional[CandidateAudit] = None
    github: Optional[GitHubAnalysis] = None
    file_name: Optional[str] = None
    stored_file: Optional[str] = None
    error: Optional[str] = None
    merged_duplicate_ids: List[str] = Field(default_factory=list)
    notes: str = ""


class BatchSummary(BaseModel):
    """Summary of the entire candidate batch processing run."""
    model_config = ConfigDict(protected_namespaces=())

    role: str
    salary_range: SalaryRange
    total_files: int
    processed_candidates: int
    ranked_candidates: int
    excluded_by_salary: int
    missing_info: int
    duplicates_merged: int
    model_backend: str
    selected_model_id: Optional[str] = None
    selected_model_label: Optional[str] = None
    generated_at: datetime
    fairness_highlights: List[str] = Field(default_factory=list)


# ============ Root API Responses ============

class ProcessResumesResponse(BaseModel):
    """The unified response for the bulk upload/parse/rank flow."""
    batch_id: str
    summary: BatchSummary
    candidates: List[CandidateRecord]


class CandidateResponse(BaseModel):
    """Full candidate response for individual GET endpoints."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    alias: str
    name: Optional[str] = None
    email: Optional[str] = None
    score: Optional[float] = None
    decision: Optional[RankingDecision] = None
    
    skills: Optional[List[str]] = None
    education: Optional[List[EducationItem]] = None
    experience: Optional[List[ExperienceItem]] = None
    certifications: Optional[List[str]] = None
    
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    
    projects: List[ProjectResponse] = []
    created_at: datetime
    updated_at: datetime


class RankedCandidatesResponse(BaseModel):
    """Grouped ranking results."""
    batch_id: int
    job_title: str
    total_candidates: int
    shortlist: List[CandidateRecord]
    review: List[CandidateRecord]
    rejected: List[CandidateRecord]


class UploadResumesResponse(BaseModel):
    """Status of a partial or initial upload run."""
    batch_id: int
    uploaded_count: int
    failed_count: int
    processing_status: str
    errors: List[str] = []


class ApiMessage(BaseModel):
    """Generic status message."""
    success: bool = True
    status: str = "success"
    message: str
    transaction_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
