from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Protocol, Optional

import httpx

from .schemas import LocalModelOption as LLMModelOption
from .settings import settings, get_api_key_for_provider
from .utils import compact_whitespace, unique_preserve_order

logger = logging.getLogger(__name__)

BUILTIN_MODEL_ID = "builtin:heuristic"
LOCAL_FALLBACK_ID = "ollama:llama3.2"  # Preferred local fallback

@dataclass(slots=True)
class LLMAnalysis:
    """Structured response returned by an LLM backend."""
    parsed_updates: dict[str, Any] = field(default_factory=dict)
    recommendation: str | None = None
    fit_score: float | None = None
    summary: str | None = None
    matched_skills: list[str] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)
    interview_questions: list[str] = field(default_factory=list)
    backend_label: str | None = None

class LLMProvider(Protocol):
    """Protocol for LLM backend providers."""
    async def list_models(self) -> list[LLMModelOption]: ...
    async def call(self, model_name: str, prompt: str, api_key: str = "") -> str: ...

class OllamaProvider:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.timeout = settings.LOCAL_LLM_TIMEOUT_SECONDS

    async def list_models(self) -> list[LLMModelOption]:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                payload = response.json()
                models: list[LLMModelOption] = []
                for item in payload.get("models", []):
                    name = item.get("name")
                    models.append(LLMModelOption(
                        id=f"ollama:{name}",
                        provider="ollama",
                        label=f"Ollama / {name}",
                        model_name=name,
                        availability="available",
                        endpoint=self.base_url,
                        description=f"Local Ollama model: {name}"
                    ))
                return models
        except Exception:
            return []

    async def call(self, model_name: str, prompt: str, api_key: str = "") -> str:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": model_name,
                    "stream": False,
                    "format": "json",
                    "messages": [
                        {"role": "system", "content": "You are a precise resume screening assistant. Return strict JSON only."},
                        {"role": "user", "content": prompt}
                    ]
                }
            )
            response.raise_for_status()
            return response.json().get("message", {}).get("content", "")

class OpenAIProvider:
    def __init__(self):
        self.timeout = settings.LOCAL_LLM_TIMEOUT_SECONDS

    async def list_models(self) -> list[LLMModelOption]:
        if not settings.OPENAI_API_KEY: return []
        return [
            LLMModelOption(
                id="openai:gpt-4o",
                provider="openai",
                label="GPTo (OpenAI)",
                model_name="gpt-4o",
                availability="available",
                description="OpenAI's most capable model."
            ),
            LLMModelOption(
                id="openai:gpt-4o-mini",
                provider="openai",
                label="GPT Mini (OpenAI)",
                model_name="gpt-4o-mini",
                availability="available",
                description="Fast and cost-effective OpenAI model."
            )
        ]

    async def call(self, model_name: str, prompt: str, api_key: str = "") -> str:
        key = api_key or settings.OPENAI_API_KEY
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": model_name,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": "You are a precise resume screening assistant. Return strict JSON only."},
                        {"role": "user", "content": prompt}
                    ]
                }
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]

class AnthropicProvider:
    def __init__(self):
        self.timeout = settings.LOCAL_LLM_TIMEOUT_SECONDS

    async def list_models(self) -> list[LLMModelOption]:
        if not settings.ANTHROPIC_API_KEY: return []
        return [
            LLMModelOption(
                id="anthropic:claude-3-5-sonnet-20240620",
                provider="anthropic",
                label="Claude 3.5 Sonnet",
                model_name="claude-3-5-sonnet-20240620",
                availability="available",
                description="Anthropic's high-performance model."
            )
        ]

    async def call(self, model_name: str, prompt: str, api_key: str = "") -> str:
        key = api_key or settings.ANTHROPIC_API_KEY
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "X-API-Key": key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model_name,
                    "max_tokens": 4096,
                    "system": "You are a precise resume screening assistant. Return strict JSON only. Do not include any text outside the JSON block.",
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            response.raise_for_status()
            return response.json()["content"][0]["text"]

class GroqProvider:
    def __init__(self):
        self.timeout = settings.LOCAL_LLM_TIMEOUT_SECONDS

    async def list_models(self) -> list[LLMModelOption]:
        if not settings.GROQ_API_KEY: return []
        return [
            LLMModelOption(
                id="groq:llama3-8b-8192",
                provider="groq",
                label="Llama 3 (Groq)",
                model_name="llama3-8b-8192",
                availability="available",
                description="Ultra-fast inference via Groq Cloud."
            ),
            LLMModelOption(
                id="groq:llama3-70b-8192",
                provider="groq",
                label="Llama 3 70B (Groq)",
                model_name="llama3-70b-8192",
                availability="available",
                description="High-accuracy large model on Groq."
            )
        ]

    async def call(self, model_name: str, prompt: str, api_key: str = "") -> str:
        key = api_key or settings.GROQ_API_KEY
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": model_name,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": "You are a precise resume screening assistant. Return strict JSON only."},
                        {"role": "user", "content": prompt}
                    ]
                }
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]

class GeminiProvider:
    def __init__(self):
        self.timeout = settings.LOCAL_LLM_TIMEOUT_SECONDS

    async def list_models(self) -> list[LLMModelOption]:
        if not settings.GEMINI_API_KEY: return []
        return [
            LLMModelOption(
                id="gemini:gemini-1.5-pro",
                provider="google",
                label="Gemini 1.5 Pro",
                model_name="gemini-1.5-pro",
                availability="available",
                description="Google's advanced Gemini model."
            ),
            LLMModelOption(
                id="gemini:gemini-1.5-flash",
                provider="google",
                label="Gemini 1.5 Flash",
                model_name="gemini-1.5-flash",
                availability="available",
                description="Fast and lightweight Gemini model."
            )
        ]

    async def call(self, model_name: str, prompt: str, api_key: str = "") -> str:
        key = api_key or settings.GEMINI_API_KEY
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}",
                json={
                    "contents": [
                        {"role": "user", "parts": [{"text": f"SYSTEM: You are a precise resume screening assistant. Return strict JSON only.\n\nUSER: {prompt}"}]}
                    ],
                    "generationConfig": {
                        "response_mime_type": "application/json",
                    }
                }
            )
            response.raise_for_status()
            return response.json()["candidates"][0]["content"]["parts"][0]["text"]

class LLMService:
    """Unified service to access both local and cloud LLM providers."""
    
    def __init__(self) -> None:
        self.providers: dict[str, LLMProvider] = {
            "ollama": OllamaProvider(),
            "openai": OpenAIProvider(),
            "anthropic": AnthropicProvider(),
            "groq": GroqProvider(),
            "google": GeminiProvider(),
        }

    def get_provider_status(self, provider_id: str, ephemeral_keys: dict | None = None) -> str:
        """Check if a provider is ready (API key present or local service reachable)."""
        if provider_id == "builtin":
            return "ready"
        
        if provider_id in ("openai", "anthropic", "google", "groq"):
            key = get_api_key_for_provider(provider_id, ephemeral_keys)
            return "ready" if key else "missing_key"
        
        # For Ollama, we'd ideally check reachability, but for now we'll assume 
        # it's 'ready' if the URL is configured, or just 'ready' as it's the fallback.
        return "ready"

    async def list_models(self, ephemeral_keys: dict | None = None) -> list[LLMModelOption]:
        models = [self._builtin_model()]
        for provider_name, provider in self.providers.items():
            provider_models = await provider.list_models()
            status = self.get_provider_status(provider_name, ephemeral_keys)
            for m in provider_models:
                m.status = status
            models.extend(provider_models)
        return self._dedupe_models(models)

    def resolve_model(self, model_id: str | None) -> LLMModelOption:
        requested_id = compact_whitespace(model_id or "")
        models = self._get_static_model_list()
        for model in models:
            if model.id == requested_id:
                return model
        return self._builtin_model()

    async def analyze_resume(
        self,
        *,
        model_id: str | None,
        role: str,
        salary_min: float,
        salary_max: float,
        required_skills: list[str],
        resume_text: str,
        parsed_resume: dict[str, Any],
        ephemeral_keys: dict | None = None,
    ) -> LLMAnalysis | None:
        model = self.resolve_model(model_id)
        
        # Fallback Logic: If cloud model selected but key is missing, route to local
        status = self.get_provider_status(model.provider, ephemeral_keys)
        if status == "missing_key":
            logger.warning(f"Provider {model.provider} missing API key. Falling back to local LLM.")
            # Try Ollama first, then Built-in
            ollama_models = await self.providers["ollama"].list_models()
            if ollama_models:
                model = ollama_models[0]
                logger.info(f"Fallback routed to Ollama: {model.label}")
            else:
                model = self._builtin_model()
                logger.info(f"Fallback routed to Deterministic Engine")

        if model.provider == "builtin":
            return None

        prompt = self._build_prompt(
            role=role,
            salary_min=salary_min,
            salary_max=salary_max,
            required_skills=required_skills,
            resume_text=resume_text,
            parsed_resume=parsed_resume,
        )

        try:
            provider = self.providers.get(model.provider)
            if not provider:
                logger.error(f"No provider found for {model.provider}")
                return None

            # Resolve the API key: ephemeral (per-session) takes priority
            api_key = get_api_key_for_provider(model.provider, ephemeral_keys)
            raw_content = await provider.call(model.model_name, prompt, api_key=api_key)
            analysis = self._parse_analysis(raw_content)
            analysis.backend_label = model.label
            return analysis
        except Exception as exc:
            logger.error(f"LLM analysis failed for {model.id}: {exc}")
            return None

    def _builtin_model(self) -> LLMModelOption:
        return LLMModelOption(
            id=BUILTIN_MODEL_ID,
            provider="builtin",
            label="Deterministic Engine (Free)",
            model_name="heuristic",
            availability="available",
            description="Built-in local parser and scoring. No cloud processing, no API keys needed."
        )

    def _get_static_model_list(self) -> list[LLMModelOption]:
        # Return a list of all possible models to allow resolution without a network call
        list_ = [self._builtin_model()]
        # Add common defaults
        list_.append(LLMModelOption(id="openai:gpt-4o", provider="openai", label="GPT-4o", model_name="gpt-4o"))
        list_.append(LLMModelOption(id="openai:gpt-4o-mini", provider="openai", label="GPT-4o-mini", model_name="gpt-4o-mini"))
        list_.append(LLMModelOption(id="groq:llama3-8b-8192", provider="groq", label="Llama 3 (Groq)", model_name="llama3-8b-8192"))
        list_.append(LLMModelOption(id="ollama:llama3.2", provider="ollama", label="Ollama / llama3.2", model_name="llama3.2"))
        list_.append(LLMModelOption(id="anthropic:claude-3-5-sonnet-20240620", provider="anthropic", label="Claude 3.5 Sonnet", model_name="claude-3-5-sonnet-20240620"))
        list_.append(LLMModelOption(id="gemini:gemini-1.5-pro", provider="google", label="Gemini 1.5 Pro", model_name="gemini-1.5-pro"))
        list_.append(LLMModelOption(id="gemini:gemini-1.5-flash", provider="google", label="Gemini 1.5 Flash", model_name="gemini-1.5-flash"))
        return list_

    def _dedupe_models(self, models: list[LLMModelOption]) -> list[LLMModelOption]:
        seen: set[str] = set()
        deduped: list[LLMModelOption] = []
        for model in models:
            if model.id in seen: continue
            seen.add(model.id)
            deduped.append(model)
        return deduped

    def _build_prompt(self, **kwargs) -> str:
        # Prompt building logic (simplified for code clarity)
        seed_parser_output = dict(kwargs["parsed_resume"])
        seed_parser_output.pop("name", None)
        seed_parser_output.pop("email", None)
        
        prompt = {
            "task": "Analyze resume and return strict JSON.",
            "job_context": {
                "role": kwargs["role"],
                "salary_range": [kwargs["salary_min"], kwargs["salary_max"]],
                "required_skills": kwargs["required_skills"],
            },
            "seed_parser_output": seed_parser_output,
            "resume_text": kwargs["resume_text"][:12000],
        }
        return json.dumps(prompt)

    def _parse_analysis(self, raw_content: str) -> LLMAnalysis:
        payload = self._extract_json(raw_content)
        parsed_updates = payload.get("parsed_resume") or {}
        return LLMAnalysis(
            parsed_updates=parsed_updates,
            recommendation=payload.get("recommendation"),
            fit_score=payload.get("fit_score"),
            summary=payload.get("summary"),
            matched_skills=payload.get("matched_skills", []),
            missing_skills=payload.get("missing_skills", []),
            interview_questions=payload.get("interview_questions", [])[:5],
        )

    def _extract_json(self, raw_content: str) -> dict[str, Any]:
        try:
            return json.loads(raw_content)
        except (json.JSONDecodeError, ValueError):
            # Fallback for fenced JSON
            start = raw_content.find("{")
            end = raw_content.rfind("}")
            if start != -1 and end != -1:
                try:
                    return json.loads(raw_content[start:end+1])
                except (json.JSONDecodeError, ValueError):
                    pass
            return {}
