import os
os.environ["DATABASE_URL"] = "sqlite:///./test_talentlens.db"

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from talentlens.api import app
from talentlens.database import init_db
from talentlens.llm_service import LLMAnalysis, BUILTIN_MODEL_ID
import talentlens.api as api_module

@pytest.mark.asyncio
async def test_health_check():
    """Expert test for system health and provider discovery."""
    init_db()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "healthy"
        assert isinstance(payload["providers"], list)

@pytest.mark.asyncio
async def test_process_resumes_multi_provider_flow(monkeypatch):
    """
    Expert test simulating a full resume processing pipeline 
    with a mocked local LLM (Ollama).
    """
    init_db()
    # 1. Setup predictable mocks
    mock_model = MagicMock()
    mock_model.id = "ollama:llama3"
    mock_model.provider = "ollama"
    mock_model.label = "Ollama (Llama 3)"
    mock_model.model_name = "llama3"
    
    mock_analysis = LLMAnalysis(
        parsed_updates={"skills": ["Python", "FastAPI"], "experience_years": 5},
        recommendation="shortlist",
        fit_score=95,
        summary="Expert-vetted candidate via local AI.",
        backend_label="Ollama (Llama 3)"
    )

    # 2. Patching with context managers/monkeypatch for reliability
    with patch.object(api_module.llm_service, "resolve_model", return_value=mock_model), \
         patch.object(api_module.llm_service, "analyze_resume", new_callable=AsyncMock, return_value=mock_analysis), \
         patch.object(api_module, "validate_api_keys", return_value=None):
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/process-resumes",
                data={
                    "role": "Python Developer",
                    "salary_min": "50000",
                    "salary_max": "150000",
                    "selected_model_id": "ollama:llama3",
                },
                files={
                    "resumes": ("expert.txt", b"Jane Doe\nSkills: Python\nExp: 5yrs\nSalary: $100,000", "text/plain")
                },
            )

            assert response.status_code == 200
            data = response.json()
            
            # Verify structured output enrichment
            candidate = data["candidates"][0]
            assert candidate["score"] > 0
            assert "Expert-vetted" in candidate["summary"]
            assert "Ollama" in candidate["summary"]
            assert candidate["experience_years"] == 5

@pytest.mark.asyncio
async def test_process_resumes_security_fail_fast():
    """Ensures the pipeline fails fast if API keys are missing for cloud providers."""
    init_db()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Force a cloud provider without a key
        mock_m = MagicMock()
        mock_m.provider = "openai"
        
        with patch.object(api_module.llm_service, "resolve_model", return_value=mock_m), \
             patch.object(api_module, "validate_api_keys", side_effect=ValueError("OPENAI_API_KEY is missing but OpenAI provider was selected.")):
            
            response = await client.post(
                "/api/process-resumes",
                data={"role": "Lead", "salary_min": 0, "salary_max": 1, "selected_model_id": "openai:gpt4"},
                files={"resumes": ("c.txt", b"Test", "text/plain")},
            )
            
            assert response.status_code == 500
            assert "OPENAI_API_KEY is missing" in response.json()["detail"]
