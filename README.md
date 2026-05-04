# HR Ranking System — Production-Grade Candidate Intelligence

A **bias-free, fully-local** HR candidate ranking platform built with FastAPI, React, and PostgreSQL. No paid APIs, complete auditability, and explainable scoring.

## 🎯 Key Features

### ✅ Core Capabilities
- **Resume Parsing**: PDF, DOCX, TXT support with intelligent field extraction
- **GitHub Intelligence**: 3-tier scrape with automatic fallback (API → HTML → Analyzer)
- **Semantic Ranking**: 4-factor weighted scoring (40% skills, 30% projects, 20% experience, 10% certifications)
- **Resume Project Extraction**: Evaluates project descriptions from resumes when no GitHub is available
- **Duplicate Detection**: Identify similar candidates with union-find algorithm
- **Fairness Auditing**: Complete decision tracking with per-factor explanations (SHAP-style)
- **Email Automation**: Real SMTP dispatch with template-based communications
- **Interview Readiness**: Auto-generate personalized interview questions locally

### 🛡️ Bias Prevention
- ✅ **PII Redaction** — Names, emails, addresses, gender markers removed before scoring
- ✅ **Anonymized Evaluation** — Deterministic, skills-only scoring
- ✅ **Neutral Project Scores** — Candidates without GitHub get 50/100 (not penalized)
- ✅ **No Institutional Bias** — All recognized degrees treated equally
- ✅ **Audit Trail** — Every decision logged with full rationale
- ✅ **Explainability** — SHAP-style factor contributions

### 🔐 Security & Privacy
- ✅ **No Hardcoded Keys** — All secrets in `.env` (gitignored)
- ✅ **Ephemeral API Keys** — HR users enter keys in the UI; they're used once and never stored
- ✅ **Masked Key Input** — Password-type fields with toggle visibility
- ✅ **Zero Backend Persistence** — API keys are never logged, saved, or cached

### 🏗️ Production Architecture
- **Backend**: FastAPI with modular microservices
- **Database**: PostgreSQL with automatic SQLite fallback
- **Frontend**: React 19 + TypeScript with Tailwind CSS
- **Deployment**: Docker Compose, Kubernetes-ready, Nginx proxy
- **CI/CD**: GitHub Actions testing + automatic builds

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites
- Docker & Docker Compose (Make sure Docker Desktop is running)
- **OR** Python 3.11+ & Node.js 18+ (for local setup)

### Option 1: Docker Compose (Recommended)

> [!IMPORTANT]
> Ensure the Docker daemon (e.g., Docker Desktop) is running before executing these commands.

```bash
# Clone or download the repository
cd talentlens

# Copy environment template
cp .env.example .env

# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

**Access:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

### Option 2: Local Development (No Docker Required)

This project features an **automatic SQLite fallback**, meaning you don't even need to set up PostgreSQL to get started locally!

#### 1. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# On Windows (CMD):
.\venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements.txt

# Run the backend
python -m uvicorn talentlens.api:app --reload --host 127.0.0.1 --port 8000
```

#### 2. Frontend Setup
```bash
# Open a new terminal in the project root directory
npm install
npm run dev
```

---

## 📧 SMTP Setup Guide (Email Automation)

TalentLens can automatically send emails to candidates (rejections, shortlist notifications, etc.) via SMTP. Here's how to set it up:

### Gmail (Recommended for Testing)

> [!IMPORTANT]
> Gmail requires an **App Password**, NOT your regular Gmail password.

1. **Enable 2-Factor Authentication** on your Google account
2. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
3. Click "Generate" → Select "Mail" as the app
4. Copy the 16-character app password
5. Update your `.env`:

```env
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

### Outlook / Office 365

```env
SMTP_SERVER=smtp.office365.com
SMTP_PORT=587
SMTP_USERNAME=your-email@outlook.com
SMTP_PASSWORD=your-password
```

### Mailtrap (Safe Testing — No Real Emails Sent)

> [!TIP]
> Mailtrap is free for testing. It captures all emails in a virtual inbox so you can verify templates without sending real emails.

1. Sign up at [mailtrap.io](https://mailtrap.io)
2. Create an inbox → Copy SMTP credentials
3. Update your `.env`:

```env
SMTP_SERVER=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USERNAME=your-mailtrap-username
SMTP_PASSWORD=your-mailtrap-password
```

### Custom SMTP Server

Any SMTP server that supports STARTTLS on port 587 will work:

```env
SMTP_SERVER=mail.yourdomain.com
SMTP_PORT=587
SMTP_USERNAME=noreply@yourdomain.com
SMTP_PASSWORD=your-smtp-password
```

### Verifying SMTP Configuration

After configuring, check the status:
- **Frontend**: Open Settings (⚙️) → Look for "Email (SMTP)" status
- **API**: `GET /api/smtp-status` → Returns `{ "configured": true/false }`

> [!NOTE]
> If SMTP is not configured, emails will be saved as **drafts** in the database. You can configure SMTP later and resend them.

---

## 🔑 API Key Management

TalentLens works completely free with its built-in Deterministic Engine. If you want cloud AI enhancement (optional):

### How It Works
1. Open **Settings** (⚙️ icon in the header)
2. Enter your API key in the masked input field
3. Toggle the 👁️ icon to verify your key
4. Keys are used for that session only

### Privacy Guarantees
- Keys are stored **only in browser memory** (JavaScript variable)
- Sent via `X-Ephemeral-Keys` header — used once, then discarded
- **Never logged, saved to database, or cached** by the backend
- Close the browser tab → keys are gone

### Supported Providers
| Provider | Key Format | Free Tier? |
|----------|-----------|------------|
| OpenAI | `sk-...` | No |
| Anthropic | `sk-ant-...` | No |
| Gemini | `AI...` | Yes (limited) |
| Groq | `gsk_...` | Yes (generous) |

---

## 📋 API Endpoints

### Core Workflow
1. **POST /set-target** — Define job role and requirements
   ```json
   {
     "job_title": "Senior Software Engineer",
     "salary_min": 100000,
     "salary_max": 150000,
     "required_skills": ["Python", "FastAPI", "PostgreSQL"],
     "preferred_skills": ["React", "Docker"]
   }
   ```

2. **POST /upload-resumes** — Upload and parse resumes
   - File multipart form
   - Returns: batch_id, upload_count, processing_status

3. **POST /rank-candidates** — Score all candidates
   - Triggers full pipeline for batch
   - Returns: ranked_count

4. **GET /ranked-candidates** — Get results grouped by tier
   - Returns: candidates sorted by decision (shortlist, review, rejected)

### Details & Audit
- **GET /candidates/{id}** — Full candidate profile
- **GET /audit-log/{id}** — Fairness audit with decision rationale
- **POST /save-note** — HR annotations
- **GET /smtp-status** — SMTP configuration status

### Communication
- **POST /send-email** — Send or draft an email (uses SMTP if configured)
- Templates available for: shortlist, review, clarification, rejection

**Full API docs at:** http://localhost:8000/docs (when running)

---

## 🏗️ Project Structure

```
hr-ranking-system/
├── backend/
│   ├── talentlens/
│   │   ├── api.py                 # FastAPI app & endpoints
│   │   ├── models.py              # SQLAlchemy ORM models
│   │   ├── database.py            # PostgreSQL connection
│   │   ├── schemas.py             # Pydantic validation
│   │   ├── parser.py              # Resume parsing (PDF, DOCX, TXT)
│   │   ├── scraper.py             # GitHub intelligence (3-tier fallback)
│   │   ├── ranking.py             # Scoring engine + resume project extraction
│   │   ├── email_service.py       # Real SMTP email dispatch
│   │   ├── audit.py               # Fairness logging
│   │   ├── llm_service.py         # LLM providers (ephemeral key support)
│   │   ├── settings.py            # Configuration
│   │   └── utils.py               # Utilities
│   ├── requirements.txt            # Python dependencies
│   ├── Dockerfile                  # Backend container
│   └── pyproject.toml             # Python metadata
│
├── src/
│   ├── App.tsx                     # React main component
│   ├── main.tsx                    # Entry point
│   ├── components/
│   │   ├── UploadPanel.tsx        # Resume upload form
│   │   ├── CandidateTable.tsx     # Results table
│   │   ├── CandidateProfile.tsx   # Candidate detail view
│   │   ├── AuditLog.tsx           # Fairness breakdown
│   │   ├── EmailPanel.tsx         # Email templates
│   │   └── NotesPanel.tsx         # HR annotations
│   └── types.ts                    # TypeScript interfaces
│
├── public/                         # Static assets
├── docker-compose.yml              # Multi-service orchestration
├── Dockerfile.frontend             # Frontend container
├── .env.example                    # Configuration template (safe to commit)
├── .github/workflows/ci-cd.yml     # GitHub Actions pipeline
└── README.md                       # This file
```

---

## ⚙️ Configuration

### Environment Variables
Copy `.env.example` to `.env` and configure:

```env
# Database (leave as-is for automatic SQLite fallback)
DATABASE_URL=postgresql://user:pass@localhost:5432/hr_ranking_db

# Email (Optional — see SMTP Setup Guide above)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Application
DEBUG=true
SECRET_KEY=your-secret-key-change-in-production

# Frontend API URL
VITE_API_URL=http://localhost:8000
```

### Customization
1. **Resume Parser**: Edit `backend/talentlens/parser.py` for custom fields
2. **Scoring Weights**: Adjust in `backend/talentlens/ranking.py` (skills, projects, experience, certs)
3. **Email Templates**: Modify in `backend/talentlens/email_service.py`
4. **GitHub Scraping**: Configure timeout in `settings.py`

---

## 🧪 Testing

### Run Backend Tests
```bash
cd backend
pip install pytest pytest-asyncio pytest-cov
pytest -v --cov=talentlens
```

### Run Frontend Tests
```bash
npm run test  # (if test setup added)
```

### Integration Tests
```bash
# Start services in Docker
docker-compose up -d

# Run full pipeline test
pytest tests/integration/test_pipeline.py -v
```

---

## 📊 Ranking Algorithm

### Scoring Breakdown
| Factor | Weight | Calculation |
|--------|--------|-------------|
| **Skill Match** | 40% | TF-IDF cosine similarity vs required skills |
| **Project Quality** | 30% | GitHub repos, resume projects, or neutral (50) |
| **Experience** | 20% | Years in role scaled to seniority |
| **Certifications** | 10% | Count and alignment to role |

### Decision Tiers
- **Shortlist** (≥75%): Strong match, immediate next steps
- **Review** (55-74%): Moderate match, worth reviewing
- **Rejected** (<55%): Below threshold
- **Needs Clarification**: Missing data (salary expectations)

### Fairness Checks
- 🔒 **PII Anonymization** — Name/email/address redacted before scoring
- 🎯 **Skills-Only** — Only professional signals influence score
- ⚖️ **No GitHub Penalty** — Candidates without GitHub get neutral 50/100
- 🏫 **No Institutional Bias** — All degrees treated equally
- 📊 **Per-Factor Tracking** — Each component logged with rationale
- 🚩 **Fairness Flags** — Warnings for potential bias (e.g., incomplete data)

---

## 🐳 Docker Deployment

### Development
```bash
docker-compose up -d
```

### Production (with Nginx reverse proxy)
```bash
docker-compose --profile production up -d
```

### Configuration
- Edit `docker-compose.yml` for port mappings, volumes, environment
- For SSL: Add certificates to `./ssl/` and update `nginx.conf`

### Database Backup
```bash
docker exec hr_ranking_db pg_dump -U postgres hr_ranking_db > backup.sql

# Restore
docker exec -i hr_ranking_db psql -U postgres hr_ranking_db < backup.sql
```

---

## ☸️ Kubernetes Deployment

Create manifests in `k8s/`:

```bash
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/ingress.yaml
```

See deployment guide for full Kubernetes setup.

---

## 📈 Scaling Path

### Current State (SQLite/Single Server)
- Suitable for <10k candidates
- ~50 resumes per batch in 3-5 min

### Phase 2 (PostgreSQL + Async Workers)
- Add Celery for async ranking
- Upgrade to PostgreSQL (done ✓)
- Scale to 100k+ candidates

### Phase 3 (Distributed + Multi-Tenant)
- Kubernetes orchestration
- Separate databases per tenant
- Monitoring with Prometheus/Grafana

---

## 🔐 Security Considerations

- [x] No hardcoded API keys in source code
- [x] `.env` files excluded via `.gitignore`
- [x] Ephemeral API key support (never persisted)
- [x] Masked key input in frontend
- [ ] Enable HTTPS/SSL in `nginx.conf`
- [ ] Configure database backups
- [ ] Set up role-based access control (if multi-user)
- [ ] Audit database query logs
- [ ] Validate file uploads (size, type)

---

## 🐛 Troubleshooting

### "Connection refused" (Database)
```bash
# Check PostgreSQL is running
docker-compose logs db

# Verify .env DATABASE_URL is correct
# Format: postgresql://user:password@host:5432/database
```

### "GitHub scraping too slow"
- Adjust `GITHUB_SCRAPE_TIMEOUT` in `.env` (default: 10s)
- Check network connectivity
- 3-tier fallback activates automatically: API → HTML → Analyzer

### "Port already in use"
```bash
# Find process on port 8000
lsof -i :8000

# Or change ports in docker-compose.yml
```

### Resume parsing errors
- Check file format (PDF, DOCX, TXT only)
- Validate file isn't corrupted
- Check logs: `docker-compose logs backend`

### "SMTP authentication failed"
- For Gmail: Use an App Password, not your regular password
- Enable 2FA first at https://myaccount.google.com/security
- See the SMTP Setup Guide section above

---

## 📚 Documentation

- **Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md)
- **API Reference**: See [API.md](API.md) or http://localhost:8000/docs
- **Deployment Guide**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md) (if available)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

All PRs must pass:
- ✅ Backend tests (`pytest`)
- ✅ Frontend tests (`npm test`)
- ✅ Security scan (Trivy)

---

## 📝 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙋 Support

- **Issues**: Open GitHub issue
- **Discussions**: Start a discussion for questions

---

**TalentLens v1.0.0** — *Local Candidate Intelligence, Bias-Free by Design*
