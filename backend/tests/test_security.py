"""Security regression tests."""
import os

os.environ["DATABASE_URL"] = "sqlite:///./test_security.db"
os.environ["DEBUG"] = "true"

import pytest
from httpx import AsyncClient, ASGITransport
from talentlens.api import app
from talentlens.database import init_db
from fastapi import HTTPException
from talentlens.security import safe_upload_path, validate_github_username, validate_upload_file
from talentlens.settings import settings


@pytest.mark.asyncio
async def test_path_traversal_blocked_on_uploads():
    init_db()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/uploads/../../etc/passwd")
        assert response.status_code in {400, 404}


def test_github_username_ssrf_guard():
    assert validate_github_username("valid-user_1") == "valid-user_1"
    assert validate_github_username("../admin") is None
    assert validate_github_username("a" * 50) is None


def test_safe_upload_path_rejects_traversal(tmp_path):
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    (uploads / "safe.pdf").write_bytes(b"%PDF")
    resolved = safe_upload_path(uploads, "safe.pdf")
    assert resolved.name == "safe.pdf"

    with pytest.raises(HTTPException):
        safe_upload_path(uploads, "../outside.pdf")


def test_rejects_oversized_upload_metadata():
    with pytest.raises(HTTPException) as exc:
        validate_upload_file("resume.pdf", settings.MAX_UPLOAD_BYTES + 1)
    assert exc.value.status_code == 413


def test_rejects_disallowed_extension():
    with pytest.raises(HTTPException) as exc:
        validate_upload_file("malware.exe", 100)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_api_key_required_when_configured(monkeypatch):
    init_db()
    monkeypatch.setattr("talentlens.settings.settings.API_KEY", "test-secret-key")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/save-note",
            json={"candidate_id": "1", "notes": "hello"},
        )
        assert response.status_code == 401

        authorized = await client.post(
            "/api/process-resumes",
            data={"role": "Engineer", "salary_min": "1", "salary_max": "2"},
            files={"resumes": ("r.txt", b"skills python", "text/plain")},
            headers={"X-API-Key": "test-secret-key"},
        )
        assert authorized.status_code != 401
