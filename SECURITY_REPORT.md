# TalentLens Security Report

Generated: 2026-06-14

## Fixed

- Removed Vite `define` mapping for `process.env.GEMINI_API_KEY`; server-side Gemini keys are no longer eligible to be embedded into frontend bundles by that config.
- Added `.env.example` with placeholder values and no real secrets.
- Replaced custom API-key comparison with `secrets.compare_digest`.
- Hardened upload download path checks using `Path.relative_to`.
- Removed production `console.error` calls from frontend error handling.
- Raised compatible backend pins for `python-multipart`, `requests`, and `python-dotenv`.

## Existing Protections

- `.env` is gitignored.
- Protected API routes enforce `X-API-Key` or bearer token when `API_KEY` is configured.
- Uploads are restricted to PDF, DOCX, and TXT, with size limits and magic-byte validation.
- DOCX extraction uses `defusedxml` and an uncompressed size cap.
- API rate limiting is enabled for `/api` routes.
- Security headers include CSP, nosniff, referrer policy, permissions policy, and optional HSTS.
- SQLAlchemy ORM is used for database access.
- Production error responses are sanitized when `DEBUG=false`.

## Risks Remaining

- If `API_KEY` is empty, mutating endpoints are open on the network. Set `API_KEY` in production and set matching `VITE_API_KEY` only for trusted deployments.
- There is no signup/login/logout/password-reset/role-based-auth implementation in this codebase. Access control is API-key based, not user/session based.
- CSRF protection is not implemented. Current API-key header auth reduces browser-forged form risk, but a cookie/session auth future would need CSRF tokens.
- SQLite fallback can hide PostgreSQL misconfiguration in production. Consider disabling fallback outside local development.
- `DATABASE_URL` and Docker Compose defaults use placeholder credentials; production must override them.
- `npm audit` reports high severity `esbuild` issues through Vite/tsx. The suggested fix requires a breaking Vite major upgrade, so it was documented instead of force-applied.
- Remaining Python dependency findings require larger framework/parser/ML upgrades and should be handled with regression tests.

## Dependency Audit

- `npm audit --audit-level=moderate`: 3 high severity findings related to `esbuild` via Vite/tsx. `npm audit fix --force` would install Vite 8.0.16, a breaking major upgrade.
- `pnpm audit` and `yarn audit`: not applicable; no pnpm/yarn lockfiles are present.
- `pip-audit -r requirements.txt`: after compatible bumps, 60 known vulnerabilities remain in 8 packages: `fastapi`, `pypdf`, `lxml`, `scikit-learn`, `torch`, `pytest`, `starlette`, and transitive `transformers`.

## Major or Higher-Risk Upgrades Deferred

- `fastapi` to at least 0.109.1 and compatible Starlette upgrades.
- `pypdf` to 6.x.
- `lxml` to 6.1.0.
- `scikit-learn` to 1.5.0 or newer.
- `torch` to a fixed 2.7+/2.9+/2.10 line depending on deployment constraints.
- `pytest` to 9.0.3.
- `transformers` to a fixed 5.x release path.
