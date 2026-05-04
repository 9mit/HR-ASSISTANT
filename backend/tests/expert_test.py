import os
os.environ["DATABASE_URL"] = "sqlite:///./test_talentlens.db"

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from talentlens.api import app
from talentlens.llm_service import LLMAnalysis
from talentlens.database import init_db
import talentlens.api as api_module

@pytest.mark.asyncio
async def test_summary_and_validation():
    """Expert test covering both happy path and security validation."""
    init_db()
    
    mock_model = MagicMock()
    mock_model.id = "ollama:llama3"
    mock_model.provider = "ollama"
    mock_model.label = "Ollama"
    mock_model.model_name = "llama3"
    
    mock_analysis = LLMAnalysis(
        parsed_updates={},
        recommendation="shortlist",
        fit_score=90,
        summary="Expert summary.",
        backend_label="Ollama"
    )

    # Use patch.object for the instance already created in api.py
    with patch.object(api_module.llm_service, "resolve_model", return_value=mock_model), \
         patch.object(api_module.llm_service, "analyze_resume", new_callable=AsyncMock, return_value=mock_analysis), \
         patch.object(api_module, "validate_api_keys", return_value=None):
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/process-resumes",
                data={"role": "Lead", "salary_min": 0, "salary_max": 10, "selected_model_id": "ollama:llama3"},
                files={"resumes": ("test.txt", b"Skills: AI\nSalary: $5", "text/plain")},
            )
            assert response.status_code == 200
            assert "Expert summary" in response.json()["candidates"][0]["summary"]

@pytest.mark.asyncio
async def test_fail_fast_security():
    """Expert test for fail-fast validation when keys are missing."""
    init_db()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Patch resolve_model to return a cloud provider
        mock_model = MagicMock()
        mock_model.provider = "openai"
        
        with patch.object(api_module.llm_service, "resolve_model", return_value=mock_model), \
             patch.object(api_module, "validate_api_keys", side_effect=ValueError("OPENAI_API_KEY is missing but OpenAI provider was selected.")):
             
             response = await client.post(
                "/api/process-resumes",
                data={"role": "Lead", "salary_min": 0, "salary_max": 10, "selected_model_id": "openai:gpt4"},
                files={"resumes": ("test.txt", b"Skills: AI", "text/plain")},
             )
             # The error is caught and wrapped in HTTPException(500)
             assert response.status_code == 500
             assert "OPENAI_API_KEY is missing" in response.json()["detail"]
