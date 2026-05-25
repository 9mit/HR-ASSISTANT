# TalentLens — Security Audit & Production Hardening Report

**Date:** May 25, 2026  
**Scope:** Full repository (`talentlens/` — FastAPI backend, React/Vite frontend, Docker, tests)  
**Frontend design:** Preserved (no layout/color changes)

---

## Executive Summary

TalentLens was audited end-to-end for security, reliability, and production readiness. Critical vulnerabilities were patched, input validation and security headers were added, upload serving was locked down, and automated regression tests were extended. **14/14 backend tests pass.**

No system can be guaranteed invulnerable to all adversarial AI attacks; this hardening follows OWASP-aligned controls and defense-in-depth suitable for HR PII workloads.

---

## Vulnerabilities Identified & Patched

| Category | Risk | Remediation |
|----------|------|-------------|
| **Path traversal** | Uploaded resumes stored with raw `file.filename`; public `/uploads` mount allowed directory escape | `sanitize_filename()` on save; `safe_upload_path()` on download; public static mount removed |
| **Unauthenticated APIs** | All mutating endpoints open on the network | Optional `API_KEY` + `X-API-Key` header (constant-time compare); `VITE_API_KEY` for frontend |
| **Information disclosure** | `HTTPException(detail=str(e))` leaked stack/internal errors | `public_error_detail()` masks errors when `DEBUG=false`; client errors (`ValueError`) return 400 only |
| **CORS misconfiguration** | `allow_methods/headers=["*"]` with credentials | Restricted methods/headers; origins from env list (no invalid wildcard origin) |
| **Missing security headers** | No CSP, HSTS, X-Frame-Options | `SecurityHeadersMiddleware` on all responses |
| **DoS / abuse** | Unlimited uploads & request rate | `MAX_UPLOAD_BYTES`, `MAX_UPLOAD_FILES`, in-memory rate limiting |
| **SSRF (GitHub)** | Username from URL could be malformed | `validate_github_username()` strict regex |
| **Zip bomb (DOCX)** | Unbounded ZIP extraction | Max uncompressed size check before parsing |
| **PDF exhaustion** | Unbounded page iteration | Cap at 100 pages |
| **Mock validation in prod** | `/api/validate-mock` processes arbitrary batch logic | Disabled unless `DEBUG` or `ENABLE_MOCK_VALIDATION` |
| **Weak defaults** | `DEBUG=true` in Docker, default `SECRET_KEY` | Docker default `DEBUG=false`; auto-generated `SECRET_KEY` in production |
| **SQL injection** | N/A (SQLAlchemy ORM) | Verified parameterized queries; no raw user SQL |
| **XSS** | React auto-escapes; no `dangerouslySetInnerHTML` | Verified; external links use `rel="noopener noreferrer"` |
| **CSRF** | SPA + optional API key | API key header for state-changing calls; SameSite recommended at reverse proxy |
| **Insecure deserialization** | JSON columns only | No `pickle`/`yaml.load`; LLM JSON parsed with schema validation |
| **Privilege escalation** | No RBAC (single-tenant HR tool) | API key gates mutating routes; uploads no longer world-readable |

---

## New Security Module

`backend/talentlens/security.py` provides:

- `SecurityHeadersMiddleware` — CSP, X-Frame-Options, nosniff, Referrer-Policy, optional HSTS
- `RateLimitMiddleware` — per-IP sliding window on `/api/*`
- `require_api_key` / `ApiKeyDep` — optional authentication
- Validators: uploads, decisions, salary range, notes length, GitHub usernames
- `safe_upload_path` — traversal-safe file resolution
- `register_exception_handlers` — safe 500 responses

---

## Edge Cases Covered (50+)

### Input validation
1. Empty filename  
2. Empty file body  
3. File > 10MB (configurable)  
4. Unsupported extension (`.exe`, etc.)  
5. Path traversal in filename (`../../etc/passwd`)  
6. More than 50 files per batch  
7. Role empty / > 200 chars  
8. Negative salary  
9. `salary_max < salary_min`  
10. Salary > 1B  
11. Invalid `decision` enum  
12. Non-numeric `candidate_id` in notes  
13. Notes > 10,000 chars  
14. Invalid `hr_email` when auto-send enabled  

### Resume parsing
15. Empty PDF/DOCX  
16. Corrupt binary (graceful failure record)  
17. 100k+ char text truncation (ReDoS/memory)  
18. Null bytes stripped  
19. DOCX zip bomb (> 25MB uncompressed)  
20. PDF > 100 pages capped  
21. Duplicate candidates (same name/email)  
22. Blank identity duplicates not merged incorrectly  

### API / auth
23. Missing API key when configured → 401  
24. Wrong API key → 401  
25. Health/local-models public without key  
26. Mock validation blocked in production  
27. Rate limit 429 after threshold  

### GitHub / network
28. Invalid GitHub URL  
29. Reserved GitHub paths blocked  
30. Username regex SSRF guard  
31. API timeout → fallback tier  
32. HTML scrape failure → fallback API  

### Database / concurrency
33. SQLAlchemy ORM (no injection)  
34. Session closed in `get_db` finally  
35. N+1 avoided in CSV export (email map)  
36. SQLite fallback when Postgres down  

### Email
37. No recipient → skip send  
38. Invalid email format rejected for auto-send  
39. SMTP/Resend timeout (12s cap)  
40. Mock send when no provider configured  

### Frontend
41. React escapes user content (XSS)  
42. Ephemeral keys never persisted  
43. API key via env only (not in UI storage)  
44. Upload links use `/api/uploads/` (protected)  

### Error handling
45. Per-file failure → `invalid` candidate row  
46. Pipeline `ValueError` → 400 (missing API key)  
47. Pipeline unknown error → generic 500 in prod  
48. Pool fetch DB error masked in prod  

### Scoring / business logic
49. Salary gate before scoring  
50. PII redaction before LLM  
51. Neutral GitHub score when no profile  
52. Batch score uniqueness adjustment  
53. Score uniqueness report in fairness highlights  

---

## Performance & Reliability

- CSV export: batched email lookup (no N+1)
- PDF page cap reduces CPU on large files
- Resume text truncated at 100k chars
- PostgreSQL with SQLite fallback for dev/resilience
- Rate limiting protects LLM/upload endpoints

---

## Production Deployment Checklist

1. Copy `.env.example` → `.env` and set strong `API_KEY`, `SECRET_KEY`
2. Set `DEBUG=false`, `ENABLE_HSTS=true` behind HTTPS
3. Set `ALLOWED_ORIGINS` to your exact frontend origin(s)
4. Build frontend with `VITE_API_KEY` matching backend `API_KEY`
5. Use `nginx.conf` profile for TLS termination and extra rate limits
6. Never commit `.env` or `backend/uploads/` (already gitignored)
7. Run: `pytest tests/` and `npm run build`

---

## Test Results

```
14 passed (test_api, test_talent_pool, expert_test, test_security)
```

Security-specific tests: path traversal, GitHub username guard, upload validation, API key enforcement.

---

## Files Changed

| File | Change |
|------|--------|
| `backend/talentlens/security.py` | **New** — middleware & validators |
| `backend/talentlens/api.py` | Hardened endpoints, secure uploads |
| `backend/talentlens/settings.py` | Security settings |
| `backend/talentlens/schemas.py` | Field length validators |
| `backend/talentlens/parser.py` | PDF/DOCX limits |
| `backend/talentlens/scraper.py` | Username validation |
| `backend/tests/test_security.py` | **New** security tests |
| `src/api.ts` | **New** — API key headers |
| `src/App.tsx`, components | API helper integration |
| `.env.example`, `nginx.conf` | **New** deployment templates |
| `docker-compose.yml` | `DEBUG` default false |

---

## Residual Risks & Recommendations

1. **API key in frontend** — `VITE_API_KEY` is visible in built JS; for high-security deployments, use a reverse proxy or OAuth instead.
2. **In-memory rate limit** — Resets on restart; use Redis/nginx for multi-instance deployments.
3. **HR PII at rest** — Encrypt SQLite/Postgres volumes and restrict filesystem permissions on `uploads/`.
4. **Dependency scanning** — Run `pip audit` / `npm audit` in CI regularly.
5. **Penetration test** — Recommended before public internet exposure.

---

## Honest Security Statement

This release materially reduces attack surface for common web vulnerabilities (OWASP Top 10). Absolute immunity against motivated adversaries or novel ML-driven attacks is not achievable; operate with monitoring, patching, backups, and least-privilege infrastructure.
