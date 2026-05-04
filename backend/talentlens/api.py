"""FastAPI application and REST endpoints."""
import logging
import os
import asyncio
import httpx
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, BackgroundTasks, APIRouter, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import Any, List, Optional
from datetime import datetime

from .database import get_db, init_db
from .settings import settings, validate_api_keys
from .schemas import (
    SetTargetRequest,
    SendRejectionsRequest,
    ApiMessage,
    GitHubAnalysis,
    GitHubRepo,
    ProcessResumesResponse,
    BatchSummary,
    CandidateRecord,
    CandidateAudit,
    CandidateCommunication,
    ScoreFactor,
    CandidateResponse,
    SalaryRange,
    SaveNotesRequest,
    LocalModelCatalogResponse,
    ParsedResume,
)
from .models import Batch, Candidate, RankingDecision, Ranking, Email, Note
from .parser import ResumeParser, COMMON_SKILLS
from .scraper import GitHubScraper
from .ranking import RankingEngine, extract_resume_projects, generate_interview_questions
from .audit import AuditService
from .llm_service import LLMService, LLMAnalysis, BUILTIN_MODEL_ID
from .utils import compact_whitespace, unique_preserve_order

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def keep_awake():
    """Genius background task to trick Hugging Face into staying awake 24/7."""
    url = "https://spidercraft01-hr-assistant.hf.space/api/health"
    async with httpx.AsyncClient() as client:
        while True:
            try:
                await client.get(url, timeout=10.0)
                logger.info("Anti-sleep ping successful")
            except Exception as e:
                pass
            await asyncio.sleep(600)  # Ping every 10 minutes

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for the FastAPI application.
    Handles startup and shutdown events.
    """
    logger.info("Starting up TalentLens API...")
    # Initialize database on startup
    init_db()
    logger.info("Database initialized successfully")
    
    # Start the 24/7 anti-sleep script
    task = asyncio.create_task(keep_awake())
    
    yield
    
    logger.info("Shutting down TalentLens API...")
    task.cancel()

# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Bias-free HR Ranking System",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Router
api_router = APIRouter(prefix="/api")

# Initialize services
resume_parser = ResumeParser()
github_scraper = GitHubScraper()
ranking_engine = RankingEngine()
audit_service = AuditService()
llm_service = LLMService()

# Create uploads directory
uploads_dir = Path(__file__).resolve().parent.parent / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)


def _parse_ephemeral_keys(header_value: str | None) -> dict | None:
    """
    Parse the X-Ephemeral-Keys header into a dict.
    Format: "OPENAI_API_KEY=sk-xxx,GROQ_API_KEY=gsk_yyy"
    These keys are NEVER stored, logged, or persisted.
    """
    if not header_value:
        return None
    keys: dict[str, str] = {}
    for part in header_value.split(","):
        if "=" in part:
            key, _, value = part.partition("=")
            key = key.strip()
            value = value.strip()
            if key and value:
                keys[key] = value
    return keys if keys else None


def _merge_parsed_resume(parsed_resume: ParsedResume, local_analysis: LLMAnalysis | None) -> ParsedResume:
    if not local_analysis:
        return parsed_resume

    payload = parsed_resume.model_dump()
    updates = local_analysis.parsed_updates
    for field in ("name", "email", "education", "experience_years", "experience_summary", "github_url", "portfolio_url", "salary_expectation"):
        if updates.get(field) not in (None, "", []):
            payload[field] = updates[field]

    payload["skills"] = unique_preserve_order((payload.get("skills") or []) + (updates.get("skills") or []))
    payload["certifications"] = unique_preserve_order((payload.get("certifications") or []) + (updates.get("certifications") or []))
    payload["missing_info_flags"] = _build_missing_info_flags(payload)
    return ParsedResume(**payload)


def _build_missing_info_flags(parsed_payload: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    if not parsed_payload.get("email"):
        flags.append("missing_email")
    if not parsed_payload.get("experience_years"):
        flags.append("missing_experience_years")
    if parsed_payload.get("salary_expectation") is None:
        flags.append("missing_salary_expectation")
    if not parsed_payload.get("skills"):
        flags.append("missing_skills")
    return flags


def _salary_status(parsed_resume: ParsedResume, decision: RankingDecision | str) -> str:
    normalized_decision = decision.value if isinstance(decision, RankingDecision) else str(decision)
    if parsed_resume.salary_expectation is None:
        return "missing_expectation"
    if normalized_decision in {"salary_mismatch", "needs_clarification"}:
        return "out_of_range"
    return "within_range"


def _candidate_summary(ranking_result: dict[str, Any], local_analysis: LLMAnalysis | None) -> str:
    base_summary = compact_whitespace(ranking_result.get("explanation", ""))
    if not local_analysis:
        return base_summary

    parts = [local_analysis.summary, base_summary]
    recommendation = local_analysis.recommendation
    label = local_analysis.backend_label or "Local AI"
    if recommendation:
        parts.append(f"{label} recommendation: {recommendation.replace('_', ' ')}.")
    return " ".join(part for part in parts if part)


# ============ Health Check ============

@api_router.get("/health")
async def health_check() -> dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "message": "HR Ranking System is running",
        "version": settings.APP_VERSION,
    }


@api_router.get("/local-models", response_model=LocalModelCatalogResponse)
async def list_local_models(
    x_ephemeral_keys: Optional[str] = Header(None),
) -> LocalModelCatalogResponse:
    """Return built-in and currently reachable LLM model options."""
    ephemeral_keys = _parse_ephemeral_keys(x_ephemeral_keys)
    models = await llm_service.list_models(ephemeral_keys=ephemeral_keys)
    return LocalModelCatalogResponse(
        default_model_id=llm_service.resolve_model(None).id,
        models=models,
    )


@api_router.post("/validate-mock", response_model=ProcessResumesResponse)
async def validate_mock(
    selected_model_id: str | None = Form(None),
    x_ephemeral_keys: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> ProcessResumesResponse:
    """
    Validate the system against mock resumes stored in the mock_resumes folder.
    """
    mock_dir = Path(__file__).resolve().parent.parent.parent / "mock_resumes"
    if not mock_dir.exists():
        raise HTTPException(status_code=404, detail="Mock resumes directory not found")
    
    mock_files = list(mock_dir.glob("*.pdf"))
    if not mock_files:
        raise HTTPException(status_code=404, detail="No mock resumes found")

    # Simulate UploadFile objects for the pipeline
    from fastapi import UploadFile
    import io

    resumes = []
    for p in mock_files[:10]: # Limit to 10
        with open(p, "rb") as f:
            content = f.read()
            resumes.append(UploadFile(
                filename=p.name,
                file=io.BytesIO(content),
                size=len(content)
            ))

    ephemeral_keys = _parse_ephemeral_keys(x_ephemeral_keys)

    return await _run_candidate_pipeline(
        role="Senior Full Stack Engineer",
        salary_min=1200000,
        salary_max=2500000,
        selected_model_id=selected_model_id,
        resumes=resumes,
        db=db,
        ephemeral_keys=ephemeral_keys,
    )


# ============ Unified Processing (Frontend Entry Point) ============

@api_router.post("/process-resumes", response_model=ProcessResumesResponse)
async def process_resumes(
    role: str = Form(...),
    salary_min: float = Form(...),
    salary_max: float = Form(...),
    selected_model_id: str | None = Form(None),
    auto_send_emails: bool = Form(False),
    company_name: str | None = Form(None),
    hr_email: str | None = Form(None),
    hr_name: str | None = Form(None),
    resumes: List[UploadFile] = File(...),
    x_ephemeral_keys: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> ProcessResumesResponse:
    """
    Unified endpoint to handle the entire candidate pipeline in one request.
    When auto_send_emails=True, emails are sent automatically to all candidates
    based on their score decision (shortlist, rejected, etc.).
    """
    ephemeral_keys = _parse_ephemeral_keys(x_ephemeral_keys)

    return await _run_candidate_pipeline(
        role=role,
        salary_min=salary_min,
        salary_max=salary_max,
        selected_model_id=selected_model_id,
        resumes=resumes,
        db=db,
        ephemeral_keys=ephemeral_keys,
        auto_send_emails=auto_send_emails,
        company_name=company_name,
        hr_email=hr_email,
        hr_name=hr_name,
    )


async def _run_candidate_pipeline(
    role: str,
    salary_min: float,
    salary_max: float,
    selected_model_id: str | None,
    resumes: List[UploadFile],
    db: Session,
    ephemeral_keys: dict | None = None,
    auto_send_emails: bool = False,
    company_name: str | None = None,
    hr_email: str | None = None,
    hr_name: str | None = None,
) -> ProcessResumesResponse:
    """Core logic for the candidate screening pipeline."""
    try:
        # 1. Create Batch
        batch = Batch(
            job_title=role,
            salary_min=salary_min,
            salary_max=salary_max,
            required_skills=[],
        )
        
        # Simple keyword extraction for required skills
        potential_skills = [s for s in COMMON_SKILLS if s in role.lower()]
        batch.required_skills = unique_preserve_order(potential_skills)
        
        db.add(batch)
        db.commit()
        db.refresh(batch)
        
        required_skills = batch.required_skills
        candidates_list = []
        processed_count = 0
        excluded_by_salary = 0
        missing_info = 0
        duplicates_merged = 0
        seen_identifiers = set() 
        
        # 2a. Validate API keys for cloud providers (using ephemeral if available)
        selected_model = llm_service.resolve_model(selected_model_id)
        validate_api_keys(settings, selected_model.provider, ephemeral_keys)
        chosen_backend_label = selected_model.label
        local_ai_used_count = 0
        
        # 2. Process Files
        for idx, file in enumerate(resumes):
            try:
                # Save file
                filename = f"batch_{batch.id}_{idx}_{file.filename}"
                filepath = uploads_dir / filename
                contents = await file.read()
                with open(filepath, "wb") as f:
                    f.write(contents)
                
                # Parse
                raw_text = resume_parser.extract_text_from_bytes(file.filename, contents)
                parsed_data = resume_parser.parse(file.filename, raw_text)
                
                # Duplicate Detection Logic — only flag duplicates when
                # at least name or email is known so that blank entries
                # don't collapse into one record.
                has_identity = bool(parsed_data.name or parsed_data.email)
                identifier = f"{(parsed_data.name or '')}|{(parsed_data.email or '')}|{(parsed_data.phone or '')}".lower().strip("|")
                if has_identity and identifier in seen_identifiers:
                    duplicates_merged += 1
                    logger.info(f"Duplicate candidate skipped: {parsed_data.name} ({parsed_data.email})")
                    continue
                if has_identity:
                    seen_identifiers.add(identifier)

                # AI Analysis (Optional — uses ephemeral keys if provided)
                local_analysis = await llm_service.analyze_resume(
                    model_id=selected_model.id,
                    role=role,
                    salary_min=salary_min,
                    salary_max=salary_max,
                    required_skills=required_skills,
                    resume_text=parsed_data.redacted_text or parsed_data.raw_text,
                    parsed_resume=parsed_data.model_dump(),
                    ephemeral_keys=ephemeral_keys,
                )
                parsed_data = _merge_parsed_resume(parsed_data, local_analysis)
                if local_analysis:
                    local_ai_used_count += 1
                
                # Create Candidate
                candidate = Candidate(
                    batch_id=batch.id,
                    alias=f"Candidate-{idx + 1:03d}",
                    name=parsed_data.name,
                    email=parsed_data.email,
                    skills=parsed_data.skills,
                    education=parsed_data.education,
                    experience=parsed_data.experience_summary,
                    certifications=parsed_data.certifications,
                    github_url=parsed_data.github_url,
                    portfolio_url=parsed_data.portfolio_url,
                    salary_min=parsed_data.salary_expectation,
                )
                db.add(candidate)
                db.flush()
                
                # 3. GitHub Intelligence
                github_info = None
                if candidate.github_url:
                    try:
                        github_info = github_scraper.analyze_profile(candidate.github_url)
                        # Merge GitHub email if resume didn't have one
                        github_email = github_info.get("email") if github_info else None
                        if github_email and not candidate.email:
                            candidate.email = github_email
                            logger.info(f"Merged email from GitHub for {candidate.alias}: {github_email}")
                    except Exception as ge:
                        logger.warning(f"GitHub skip for {candidate.alias}: {str(ge)}")

                # 3b. Extract projects from resume text (for fair comparison)
                resume_projects = extract_resume_projects(
                    parsed_data.redacted_text or parsed_data.raw_text
                )
                
                # 4. Rank — with both GitHub and resume projects for fair scoring
                job_reqs = {
                    "required_skills": required_skills,
                    "salary_min": salary_min,
                    "salary_max": salary_max
                }
                c_data = {
                    "skills": candidate.skills,
                    "experience_years": parsed_data.experience_years or 0,
                    "projects": github_info.get("repositories", []) if github_info else [],
                    "resume_projects": resume_projects,
                    "certifications": candidate.certifications,
                    "salary_expectation": candidate.salary_min,
                }
                
                ranking_result = ranking_engine.rank_candidate(c_data, job_reqs)
                decision_value = (
                    ranking_result["decision"].value
                    if isinstance(ranking_result["decision"], RankingDecision)
                    else str(ranking_result["decision"])
                )
                
                # Update Candidate
                candidate.score = ranking_result["overall_score"]
                candidate.decision = decision_value
                missing_info += len(parsed_data.missing_info_flags)
                
                # 5. Create Audit
                audit_service.create_audit_log(candidate, batch.id, ranking_result, db)
                
                # 6. Build audit response
                audit_raw = audit_service.get_audit_report(candidate.id, db)
                audit_response = None
                if audit_raw and isinstance(audit_raw, dict):
                    factor_contributions = []
                    for fc in audit_raw.get("factor_contributions", []):
                        factor_contributions.append(ScoreFactor(
                            factor=fc.get("factor", ""),
                            weight=fc.get("weight", 0),
                            raw_score=fc.get("raw_score", 0),
                            contribution=fc.get("contribution", 0),
                            explanation=fc.get("explanation", ""),
                        ))
                    audit_response = CandidateAudit(
                        overview=audit_raw.get("overview"),
                        decision=audit_raw.get("decision"),
                        anonymization=audit_raw.get("anonymization", []),
                        factor_contributions=factor_contributions,
                        salary_gate=audit_raw.get("salary_gate"),
                        log_entries=audit_raw.get("log_entries", []),
                        notes=audit_raw.get("fairness_flags", []),
                    )
                
                # 7. Generate email drafts for client-side mailto links
                comm_response = None
                
                # Built-in templates for client-side drafting
                templates = {
                    "shortlist": {"subject": "Congratulations! Your Application for {job_title}", "body": "Dear {candidate_name},\n\nCongratulations! We are pleased to inform you that your application for the {job_title} position at {company_name} has been selected to move forward in our hiring process.\n\nWe were impressed by your background and qualifications. Our hiring team would like to schedule a discussion to learn more about your experience and explore how you could contribute to our team.\n\nPlease reply to this email with your availability for a call in the coming week.\n\nBest regards,\n{company_name} Hiring Team"},
                    "review": {"subject": "Application Update — {job_title}", "body": "Dear {candidate_name},\n\nThank you for applying for the {job_title} position at {company_name}. Your application is currently under review by our hiring team.\n\nWe will be in touch with next steps within the next 2 weeks.\n\nBest regards,\n{company_name} Hiring Team"},
                    "rejected": {"subject": "Your Application for {job_title}", "body": "Dear {candidate_name},\n\nThank you for your interest in the {job_title} position at {company_name}. After careful consideration of your application, we have decided to move forward with other candidates whose qualifications more closely match our current needs.\n\nWe appreciate the time you invested in our process and encourage you to apply for future openings that align with your skills and experience.\n\nBest regards,\n{company_name} Hiring Team"},
                    "needs_clarification": {"subject": "Additional Information Needed — {job_title}", "body": "Dear {candidate_name},\n\nThank you for your interest in the {job_title} position at {company_name}. We would like to clarify a few details from your application before proceeding with our evaluation.\n\nCould you please provide the following information:\n- Your current salary expectations\n- Availability for the role\n\nPlease reply to this email with this information.\n\nBest regards,\n{company_name} Hiring Team"}
                }
                
                if decision_value in templates:
                    tmpl = templates[decision_value]
                    comm_response = CandidateCommunication(
                        subject=tmpl["subject"].format(job_title=role),
                        body=tmpl["body"].format(
                            candidate_name=candidate.name or candidate.alias,
                            job_title=role,
                            company_name=company_name or "Our Company"
                        ),
                        status="draft",
                    )

                # 7b. Generate interview questions locally (no external API)
                interview_questions = (
                    local_analysis.interview_questions if local_analysis and local_analysis.interview_questions
                    else generate_interview_questions(
                        role=role,
                        skills=candidate.skills or [],
                        experience_summary=parsed_data.experience_summary,
                        projects=(github_info.get("repositories", []) if github_info else resume_projects),
                    )
                )
                
                # 8. Map to Record for Response
                record = CandidateRecord(
                    id=str(candidate.id),
                    alias=candidate.alias,
                    name=candidate.name,
                    email=candidate.email,
                    education=parsed_data.education,
                    experience_years=parsed_data.experience_years,
                    experience_summary=parsed_data.experience_summary,
                    skills=candidate.skills or [],
                    certifications=parsed_data.certifications or [],
                    score=candidate.score or 0.0,
                    decision=decision_value or "review",
                    summary=_candidate_summary(ranking_result, local_analysis),
                    salary_status=_salary_status(parsed_data, decision_value),
                    github=GitHubAnalysis(
                        profile_url=candidate.github_url,
                        success=github_info.get("source") is not None if github_info else False,
                        scrape_method=github_info.get("source") or "none" if github_info else "none",
                        repos=[
                            GitHubRepo(
                                name=r.get("name", "unknown"),
                                description=r.get("description"),
                                url=r.get("url"),
                                stars=r.get("stars", 0),
                                forks=r.get("forks", 0),
                                primary_language=r.get("language")
                            ) for r in (github_info.get("repositories", []) if github_info else [])
                        ],
                        aggregate_project_quality=github_info.get("profile_quality_score", 0.0) if github_info else 0.0
                    ) if candidate.github_url else None,
                    github_url=candidate.github_url,
                    portfolio_url=parsed_data.portfolio_url,
                    salary_expectation=parsed_data.salary_expectation,
                    missing_info_flags=parsed_data.missing_info_flags,
                    interview_questions=interview_questions,
                    file_name=file.filename,
                    stored_file=filename,
                    audit=audit_response,
                    communication=comm_response,
                )
                candidates_list.append(record)
                processed_count += 1
                
                if decision_value == "salary_mismatch":
                    excluded_by_salary += 1
                    
            except Exception as fe:
                logger.error(f"Failed candidate {file.filename}: {str(fe)}")
                continue

        db.commit()
        
        # 7. Generate Summary
        fairness_highlights = [
            f"Screening backend: {chosen_backend_label}.",
            "PII redaction ran before any optional local AI analysis.",
            "Deterministic scoring remained active for final ranking decisions.",
            "Project scores are neutral (50) for candidates without GitHub — no bias.",
        ]
        if selected_model.id != BUILTIN_MODEL_ID:
            fairness_highlights.append(f"AI enhanced {local_ai_used_count} of {processed_count} processed resumes.")

        # Sort candidates by score descending before returning
        candidates_list.sort(key=lambda x: x.score, reverse=True)

        summary = BatchSummary(
            role=role,
            salary_range=SalaryRange(minimum=salary_min, maximum=salary_max),
            total_files=len(resumes),
            processed_candidates=processed_count,
            ranked_candidates=processed_count,
            excluded_by_salary=excluded_by_salary,
            missing_info=missing_info,
            duplicates_merged=duplicates_merged,
            model_backend=chosen_backend_label,
            selected_model_id=selected_model.id,
            selected_model_label=chosen_backend_label,
            generated_at=datetime.utcnow(),
            fairness_highlights=fairness_highlights,
        )
        
        return ProcessResumesResponse(
            batch_id=str(batch.id),
            summary=summary,
            candidates=candidates_list
        )
        
    except Exception as e:
        logger.error(f"Pipeline error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Legacy Endpoints (under /api) ============

@api_router.post("/set-target", response_model=ApiMessage)
async def set_target(request: SetTargetRequest, db: Session = Depends(get_db)) -> ApiMessage:
    """Set target job role and requirements."""
    try:
        batch = Batch(
            job_title=request.job_title,
            job_description=request.job_description,
            salary_min=request.salary_min,
            salary_max=request.salary_max,
            required_skills=request.required_skills or [],
            preferred_skills=request.preferred_skills or [],
        )
        db.add(batch)
        db.commit()
        db.refresh(batch)
        return ApiMessage(message=f"Target role set successfully", data={"batch_id": batch.id})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/candidates/{candidate_id}", response_model=CandidateResponse)
async def get_candidate_profile(candidate_id: int, db: Session = Depends(get_db)) -> CandidateResponse:
    """Get detailed profile for a single candidate."""
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate

@api_router.post("/save-note")
async def save_note(request: SaveNotesRequest, db: Session = Depends(get_db)) -> ApiMessage:
    """Save HR notes."""
    try:
        c_id = int(request.candidate_id)
        # Check if note exists for candidate
        note = db.query(Note).filter(Note.candidate_id == c_id).first()
        if note:
            note.content = request.notes
            note.updated_at = datetime.utcnow()
        else:
            note = Note(candidate_id=c_id, content=request.notes)
            db.add(note)
        
        db.commit()
        return ApiMessage(message="Note saved successfully")
    except Exception as e:
        logger.error(f"Error saving note: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to save note")





@api_router.get("/export-candidates/{batch_id}")
async def export_candidates(batch_id: int, db: Session = Depends(get_db)):
    """
    Export candidates for a batch as a downloadable CSV file.
    Columns: Candidate Name, Email, Score, Status, Job Title, Skills, Email Sent
    """
    import csv
    import io
    from fastapi.responses import StreamingResponse

    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    candidates = db.query(Candidate).filter(Candidate.batch_id == batch_id).order_by(Candidate.score.desc()).all()

    # Build CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Candidate Name",
        "Email",
        "Score",
        "Status",
        "Job Title",
        "Skills",
        "Email Sent",
    ])

    for c in candidates:
        # Check if email was sent
        email_record = db.query(Email).filter(
            Email.candidate_id == c.id,
            Email.status == "sent",
        ).first()

        decision_label = {
            "shortlist": "Accepted",
            "review": "Under Review",
            "rejected": "Rejected",
            "needs_clarification": "Needs Clarification",
            "salary_mismatch": "Salary Mismatch",
        }.get(c.decision or "", c.decision or "Unknown")

        writer.writerow([
            c.name or c.alias,
            c.email or "Not found",
            f"{c.score:.1f}" if c.score else "N/A",
            decision_label,
            batch.job_title,
            ", ".join(c.skills[:8]) if c.skills else "N/A",
            "Yes" if email_record else "No",
        ])

    output.seek(0)
    safe_title = batch.job_title.replace(" ", "_")[:30]
    filename = f"TalentLens_{safe_title}_{batch.id}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# Include Router
app.include_router(api_router)


# Serve uploaded resume files for frontend preview/download
if uploads_dir.exists():
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# Serve static frontend files if they exist
frontend_build = Path(__file__).resolve().parent.parent.parent / "dist"
if frontend_build.exists():
    app.mount("/", StaticFiles(directory=str(frontend_build), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "7860"))
    uvicorn.run(app, host="0.0.0.0", port=port)
