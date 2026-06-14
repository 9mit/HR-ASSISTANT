# Changelog

## 2026-06-14

- Added `AUDIT_REPORT.md` with tech stack, architecture, route, model, environment, dead code, and dependency inventories.
- Added `SECURITY_REPORT.md` documenting fixed issues, existing controls, dependency audit findings, and remaining risks.
- Added `PERFORMANCE_REPORT.md` with bundle observations, current safeguards, and low-risk recommendations.
- Added `TEST_REPORT.md` with verification commands and test gaps.
- Added `.env.example` with safe placeholder configuration.
- Removed Vite build-time `GEMINI_API_KEY` injection to avoid frontend secret exposure.
- Removed unused top-level frontend dependencies `dotenv` and `framer-motion`.
- Raised backend minimum/pinned versions for `python-multipart`, `requests`, and `python-dotenv` to address compatible dependency audit findings.
- Replaced frontend production console logging with existing notification/error-state handling.
- Persisted shortlist decisions through `PUT /api/candidates/{candidate_id}/decision`.
- Added non-2xx error handling for note saves.
- Hardened upload download path validation with `Path.relative_to`.
- Switched API-key comparison to `secrets.compare_digest`.
- Updated legacy candidate response typing to match stored candidate ORM data.
