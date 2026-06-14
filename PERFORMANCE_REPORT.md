# TalentLens Performance Report

Generated: 2026-06-14

## Observations

- Frontend production bundle built successfully: JS 466.98 kB, gzip 139.29 kB; CSS 55.59 kB, gzip 9.24 kB.
- Candidate export prefetches sent emails by candidate ID, avoiding an N+1 query.
- Database indexes cover batch, decision, score, candidate/batch ranking and audit lookups.
- Resume parsing caps raw text, PDF pages, upload size, upload count, and DOCX uncompressed size.

## Low-Risk Improvements Applied

- Removed unused top-level frontend dependencies (`dotenv`, `framer-motion`), reducing dependency surface.
- Kept UI structure/styles untouched.

## Remaining Performance Risks

- `/api/process-resumes` performs parsing, optional LLM analysis, GitHub scraping, ranking, audit creation, and optional email sending synchronously in one request.
- SQLAlchemy uses `NullPool` for PostgreSQL, which may be inefficient under sustained production load.
- In-memory rate limiting is per-process and does not coordinate across workers.
- Large batches with slow GitHub/LLM providers can exceed user request expectations.
- No bundle splitting strategy is configured; current bundle is acceptable but could grow.

## Recommendations

- Move long-running resume processing to a background job queue.
- Use a bounded database connection pool for production PostgreSQL.
- Add request timeout and cancellation behavior around per-resume external calls.
- Add observability around processing duration per file/provider.
