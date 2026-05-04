from __future__ import annotations

import hashlib
import json
import re
import uuid
from pathlib import Path
from typing import Iterable


EMAIL_RE = re.compile(r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)")
PHONE_RE = re.compile(r"(\+?\d[\d\s().-]{7,}\d)")
URL_RE = re.compile(r"((?:https?://|www\.)[^\s)>\]]+)", re.IGNORECASE)
GITHUB_RE = re.compile(r"(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.-]+)(?:/([A-Za-z0-9_.-]+))?", re.IGNORECASE)
PORTFOLIO_HINTS = ("portfolio", "behance", "dribbble", "notion.site", "vercel.app", "netlify.app", "webflow.io")


def compact_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def normalize_skill(skill: str) -> str:
    normalized = compact_whitespace(skill).lower()
    normalized = normalized.replace("js", "javascript") if normalized == "js" else normalized
    normalized = normalized.replace("ts", "typescript") if normalized == "ts" else normalized
    return normalized


def unique_preserve_order(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = compact_whitespace(value)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(cleaned)
    return result


def safe_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=True, default=str)


def stable_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8", errors="ignore")).hexdigest()


def candidate_id(prefix: str = "cand") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def alias_from_index(index: int) -> str:
    return f"Candidate-{index:03d}"


def sanitize_filename(name: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", name.strip())
    return safe or f"resume_{uuid.uuid4().hex[:8]}"


def parse_salary_value(raw_value: str | None) -> float | None:
    if not raw_value:
        return None

    match = re.search(
        r"(?P<number>\d+(?:[.,]\d+)?)\s*(?P<unit>k|m|lpa|lakh|lakhs|lac|crore|cr)?",
        raw_value.lower(),
    )
    if not match:
        return None

    number = float(match.group("number").replace(",", ""))
    unit = (match.group("unit") or "").lower()
    multipliers = {
        "k": 1_000,
        "m": 1_000_000,
        "lpa": 100_000,
        "lakh": 100_000,
        "lakhs": 100_000,
        "lac": 100_000,
        "crore": 10_000_000,
        "cr": 10_000_000,
    }
    return number * multipliers.get(unit, 1)


def read_text_safely(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def guess_portfolio_url(urls: Iterable[str]) -> str | None:
    for url in urls:
        lowered = url.lower()
        if "github.com" in lowered:
            continue
        if any(hint in lowered for hint in PORTFOLIO_HINTS):
            return url
    for url in urls:
        lowered = url.lower()
        if "linkedin.com" not in lowered and "github.com" not in lowered:
            return url
    return None
