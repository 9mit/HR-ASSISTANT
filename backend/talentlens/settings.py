import os
import secrets
from pathlib import Path
from typing import List
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings


def _find_env_file() -> str:
    """Search for .env starting from this file's directory and walking up."""
    current = Path(__file__).resolve().parent
    for _ in range(5):
        candidate = current / ".env"
        if candidate.is_file():
            return str(candidate)
        current = current.parent
    return ".env"  # Fall back to CWD


class Settings(BaseSettings):
    """Application settings. Values are loaded automatically from .env by pydantic-settings."""

    # Database
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/hr_ranking_db"

    # Debug
    DEBUG: bool = False

    # Email Service — Legacy SMTP (for self-hosted deployments)
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""

    # Platform Email — Resend (for SaaS mode, zero-config for HR users)
    # Sign up free at https://resend.com — 3,000 emails/month free tier
    RESEND_API_KEY: str = ""
    PLATFORM_FROM_EMAIL: str = "TalentLens <notifications@talentlens.app>"
    PLATFORM_COMPANY_NAME: str = "TalentLens"

    # Application
    APP_NAME: str = "TalentLens"
    APP_VERSION: str = "1.0.0"

    # GitHub Scraping
    GITHUB_SCRAPE_TIMEOUT: int = 10
    GITHUB_FALLBACK_API: str = "https://githubrepoanalyser.netlify.app/"

    # Local LLM Providers
    LOCAL_LLM_TIMEOUT_SECONDS: int = 45
    LOCAL_LLM_DEFAULT_MODEL: str = ""
    LOCAL_LLM_TEMPERATURE: float = 0.1
    LOCAL_LLM_EXTRA_MODELS: str = "[]"

    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    GOOGLE_LOCAL_BASE_URL: str = "http://127.0.0.1:8001"

    # Cloud API Keys (from .env — these are server-level defaults only).
    # HRs can also supply keys per-session via the frontend; those ephemeral
    # keys are NEVER stored, logged, or persisted by the backend.
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    # Security
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    API_KEY: str = ""
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024
    MAX_UPLOAD_FILES: int = 50
    RATE_LIMIT_REQUESTS: int = 120
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    ENABLE_MOCK_VALIDATION: bool = False
    ENABLE_HSTS: bool = False
    HSTS_MAX_AGE: int = 31536000
    CONTENT_SECURITY_POLICY: str = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )

    # CORS — comma-separated in .env, e.g. http://localhost:5173,https://myapp.hf.space
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:7860",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:7860",
    ]

    class Config:
        env_file = _find_env_file()
        case_sensitive = True
        extra = "ignore"

    @field_validator("DEBUG", mode="before")
    @classmethod
    def normalize_debug(cls, value):
        if isinstance(value, bool):
            return value
        normalized = str(value).strip().lower()
        return normalized in {"1", "true", "yes", "on", "debug"}

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value):
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def ensure_secret_key(self):
        if not self.SECRET_KEY:
            self.SECRET_KEY = (
                "dev-secret-key-change-in-production"
                if self.DEBUG
                else secrets.token_urlsafe(32)
            )
        return self


def get_api_key_for_provider(provider_id: str, ephemeral_keys: dict | None = None) -> str:
    """
    Return the API key for a given provider.

    Priority order:
    1. Ephemeral key supplied by the HR user for this session (never stored).
    2. Server-level key from the .env file.
    """
    key_mapping = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "google": "GEMINI_API_KEY",
        "groq": "GROQ_API_KEY",
    }
    env_attr = key_mapping.get(provider_id)
    if not env_attr:
        return ""

    # Check ephemeral key first (supplied per-session by HR, never persisted)
    if ephemeral_keys and ephemeral_keys.get(env_attr):
        return ephemeral_keys[env_attr]

    # Fall back to server-level key
    return getattr(settings, env_attr, "")


def validate_api_keys(settings_obj: "Settings", provider_id: str, ephemeral_keys: dict | None = None):
    """Manual check for API keys based on provider."""
    if provider_id in ("builtin", "ollama"):
        return  # No API key needed

    key = get_api_key_for_provider(provider_id, ephemeral_keys)
    if not key:
        raise ValueError(
            f"No API key available for {provider_id}. "
            f"Please enter your key in the Settings panel, or use the free built-in engine."
        )


settings = Settings()

if not settings.DEBUG and not settings.API_KEY:
    import logging as _logging

    _logging.getLogger(__name__).warning(
        "API_KEY is not set. Mutating endpoints are open to anyone on the network. "
        "Set API_KEY in production to require X-API-Key header authentication."
    )
