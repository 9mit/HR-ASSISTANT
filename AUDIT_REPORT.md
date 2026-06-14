# TalentLens Audit Report

Generated: 2026-06-14

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS v4, lucide-react, motion/react.
- Backend: FastAPI, Pydantic v2, SQLAlchemy v2, Uvicorn, PostgreSQL with SQLite fallback.
- Resume intelligence: pypdf, python-docx/docx zip parsing, defusedxml, spaCy blank pipeline, scikit-learn TF-IDF, NumPy.
- Deployment: Docker multi-stage image for Hugging Face Spaces, Docker Compose with PostgreSQL, optional Nginx reverse proxy.

## Package Versions

- Frontend installed versions observed with `npm ls --depth=0`: React 19.2.4, React DOM 19.2.4, Vite 6.4.2, TypeScript 5.8.3, Tailwind CSS 4.2.2, @vitejs/plugin-react 5.2.0, @tailwindcss/vite 4.2.2, motion 12.38.0, lucide-react 0.546.0, react-dropzone 15.0.0.
- Backend pinned versions are in `backend/requirements.txt`: FastAPI 0.104.1, Uvicorn 0.24.0, SQLAlchemy 2.0.23, Pydantic 2.5.0, Pydantic Settings 2.1.0, Alembic 1.13.1, python-multipart 0.0.27, requests 2.33.0, pypdf 3.17.0, python-docx 0.8.11, defusedxml 0.7.1, spaCy 3.7.2, scikit-learn 1.3.2, torch 2.1.1, aiosmtplib 3.0.1, python-dotenv 1.2.2.

## Frontend Architecture

- Single-page Vite app mounted in `src/main.tsx`.
- Main workflow and settings modal live in `src/App.tsx`.
- UI is componentized under `src/components`: upload form, candidate table/profile, audit log, notes, email draft, pool and rejected views.
- API URL/key helpers are centralized in `src/api.ts`.
- No client router is used; page state is tab/modal driven.

## Backend Architecture

- `backend/talentlens/api.py` defines the FastAPI app, middleware, routers, and candidate processing pipeline.
- `settings.py` loads environment-backed configuration.
- `database.py` creates a SQLAlchemy engine and session dependency.
- `models.py` contains ORM entities.
- `parser.py`, `ranking.py`, `scraper.py`, `llm_service.py`, `email_service.py`, and `audit.py` provide domain services.
- `security.py` provides API key checks, rate limiting, security headers, upload validation, and public error shaping.

## Database Schema

- `batches`: job target, salary range, required/preferred skills, timestamps.
- `candidates`: batch relationship, identity fields, skills/education/experience JSON, score, decision, raw frontend record cache, resume links, timestamps.
- `projects`: candidate projects/repositories and quality signals.
- `rankings`: factor scores, overall score, decision, explanation.
- `audit_logs`: redaction data, factor explanations, fairness flags.
- `emails`: recipient, subject/body, type, status, sent/error metadata.
- `notes`: candidate notes.
- Indexes exist for batch, decision, score, candidate/batch audit, email status, and notes lookups.

## External Integrations

- GitHub REST and HTML scraping.
- Optional fallback GitHub analyzer URL.
- Optional cloud LLM calls to OpenAI, Anthropic, Groq, and Gemini through `httpx`.
- Optional local Ollama endpoint.
- Optional SMTP via `aiosmtplib`.
- Optional Resend API.
- Optional Hugging Face Spaces keep-awake URL.

## Environment Variables

Required for production hardening: `API_KEY`, `SECRET_KEY`, `DATABASE_URL`, `ALLOWED_ORIGINS`, `VITE_API_URL`, `VITE_API_KEY`.

Optional/configuration variables: `DEBUG`, `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `RESEND_API_KEY`, `PLATFORM_FROM_EMAIL`, `PLATFORM_COMPANY_NAME`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OLLAMA_BASE_URL`, `GOOGLE_LOCAL_BASE_URL`, `LOCAL_LLM_TIMEOUT_SECONDS`, `LOCAL_LLM_DEFAULT_MODEL`, `LOCAL_LLM_TEMPERATURE`, `LOCAL_LLM_EXTRA_MODELS`, `MAX_UPLOAD_BYTES`, `MAX_UPLOAD_FILES`, `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS`, `ENABLE_HSTS`, `HSTS_MAX_AGE`, `CONTENT_SECURITY_POLICY`, `HOST`, `PORT`, `HF_SPACE_HEALTH_URL`.

## API Route Inventory

- Public: `GET /api/health`, `GET /api/local-models`.
- Protected when `API_KEY` is set: `POST /api/process-resumes`, `POST /api/set-target`, `GET /api/candidates/{candidate_id}`, `POST /api/save-note`, `PUT /api/candidates/{candidate_id}/decision`, `GET /api/pool/candidates`, `POST /api/pool/finalize`, `GET /api/export-candidates/{batch_id}`, `GET /api/uploads/{stored_file}`.
- README mentions legacy endpoints not present in code: `/api/upload-resumes`, `/api/rank-candidates`, `/api/ranked-candidates`, `/api/audit-log/{id}`, `/api/smtp-status`, `/api/send-email`.

## Page/Route Inventory

- App shell/header/settings modal.
- Upload and Active Batch tab.
- Under Consideration Pool tab.
- Rejected Candidates tab.
- Candidate profile modal tabs: Overview, Original Resume, Fairness Audit, GitHub Projects, Automated Email, Notes.
- Static frontend build is served by FastAPI at `/` when `dist/` exists.

## Dead Code and Unused Dependency Inventory

- Removed unused top-level frontend dependencies: `dotenv`, `framer-motion`.
- `EmailStatus`, `SendEmailRequest`, `SaveNoteRequest`, `RankedCandidatesResponse`, and `UploadResumesResponse` are currently unused by implemented routes but may represent planned/legacy contracts.
- README references several docs/endpoints/manifests that do not exist in this repo.

## Code Quality Findings Fixed

- Removed frontend console error logging from production paths.
- Persisted shortlist decisions through the backend instead of local-only state.
- Added failure notification when saving notes receives a non-2xx response.
- Removed frontend build-time exposure of `GEMINI_API_KEY`.
- Hardened upload path traversal checks.
- Adjusted legacy candidate response schema to match stored ORM data.
- Raised compatible vulnerable backend pins for `python-multipart`, `requests`, and `python-dotenv`.
