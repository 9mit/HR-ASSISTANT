# ============================================================
#  TalentLens — Unified Dockerfile for Hugging Face Spaces
#  Builds React frontend + FastAPI backend in a single container.
#  Serves everything on port 7860 (HF Spaces requirement).
# ============================================================

# ── Stage 1: Build React Frontend ─────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /frontend

# Copy package files and install deps (excluding package-lock to avoid cross-platform native binding errors)
COPY package.json ./
RUN npm install

# Copy frontend source and build
# VITE_API_URL="" makes API calls relative (same-origin), which is required
# because frontend and backend are served from the same port on HF Spaces.
COPY index.html tsconfig.json vite.config.ts ./
COPY src/ ./src/
ENV VITE_API_URL=""
RUN npm run build

# ── Stage 2: Python Backend + Serve Built Frontend ────────────
FROM python:3.11-slim

# System dependencies for lxml, psycopg2, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/ ./backend/

# Copy the built React frontend into the location FastAPI expects
# (api.py line 741: frontend_build = Path(__file__).parent.parent.parent / "dist")
# __file__ = /app/backend/talentlens/api.py → parent.parent.parent = /app
COPY --from=frontend-build /frontend/dist ./dist/

# Copy mock resumes for validation endpoint
COPY mock_resumes/ ./mock_resumes/

# Create required directories
RUN mkdir -p /app/backend/uploads /app/backend/data

# Hugging Face Spaces runs as user 1000 — make dirs writable
RUN chmod -R 777 /app/backend/uploads /app/backend/data

# Hugging Face Spaces exposes port 7860 ONLY
EXPOSE 7860

# Set working directory to backend so uvicorn can find the talentlens module
WORKDIR /app/backend

# Start FastAPI — serving both API and static frontend on :7860
CMD ["python", "-m", "uvicorn", "talentlens.api:app", \
     "--host", "0.0.0.0", "--port", "7860", \
     "--workers", "1", "--timeout-keep-alive", "120"]
