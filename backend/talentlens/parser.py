from __future__ import annotations

import io
import re
import zipfile
from datetime import datetime
from html import unescape
from pathlib import Path
from defusedxml import ElementTree

import logging

from pypdf import PdfReader

from .schemas import ParsedResume
from .utils import (
    EMAIL_RE,
    GITHUB_RE,
    PHONE_RE,
    URL_RE,
    compact_whitespace,
    guess_portfolio_url,
    parse_salary_value,
    unique_preserve_order,
)

logger = logging.getLogger(__name__)

MAX_DOCX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024
MAX_PDF_PAGES = 100


COMMON_SKILLS = [
    "react",
    "next.js",
    "typescript",
    "javascript",
    "html",
    "css",
    "tailwind",
    "redux",
    "vite",
    "node.js",
    "express",
    "python",
    "fastapi",
    "django",
    "flask",
    "java",
    "spring boot",
    "c#",
    ".net",
    "go",
    "rust",
    "sql",
    "postgresql",
    "mysql",
    "sqlite",
    "mongodb",
    "redis",
    "docker",
    "kubernetes",
    "aws",
    "azure",
    "gcp",
    "terraform",
    "linux",
    "git",
    "github actions",
    "ci/cd",
    "pytest",
    "jest",
    "playwright",
    "cypress",
    "graphql",
    "rest api",
    "microservices",
    "machine learning",
    "deep learning",
    "pytorch",
    "tensorflow",
    "scikit-learn",
    "nlp",
    "pandas",
    "numpy",
    "spark",
    "airflow",
    "tableau",
    "power bi",
    "figma",
    "design systems",
    "ui/ux",
    "storybook",
    "webpack",
    "sass",
    "php",
    "laravel",
    "salesforce",
    "android",
    "kotlin",
    "swift",
    "react native",
    "flutter",
    "data structures",
    "algorithms",
    "oop",
]

EDUCATION_HINTS = (
    "b.tech",
    "m.tech",
    "bachelor",
    "master",
    "b.sc",
    "m.sc",
    "mba",
    "bca",
    "mca",
    "phd",
    "university",
    "college",
    "institute",
    "vidyalaya",
    "shiksha",
    "mahavidyalaya",
)
CERTIFICATION_HINTS = (
    "certification",
    "certified",
    "certificate",
    "aws",
    "azure",
    "google cloud",
    "scrum",
    "pmp",
    "oracle",
    "salesforce",
)
ADDRESS_HINTS = ("street", "road", "avenue", "lane", "nagar", "city", "state", "pin", "zipcode", "postal")
EXPERIENCE_HINTS = ("experience", "employment", "work history", "professional summary", "projects", "kaam", "karya", "anubhav", "fresher")
PRONOUN_RE = re.compile(r"\b(he|she|him|her|his|hers|mr|mrs|ms|miss)\b", re.IGNORECASE)
SALARY_RE = re.compile(
    r"(?:expected|current|desired|salary|compensation|ctc)[^0-9]{0,10}([\$€£₹]?\s?\d+(?:[.,]\d+)?\s*(?:k|m|lpa|lakh|lakhs|lac|crore|cr)?)",
    re.IGNORECASE,
)
MARITAL_STATUS_RE = re.compile(r"(?i)(marital\s*status\s*[:\-]?\s*)(single|married|unmarried|divorced|widowed)\b")
RELIGION_RE = re.compile(r"(?i)(religion\s*[:\-]?\s*)([a-zA-Z]+)")
DOB_RE = re.compile(r"(?i)((?:dob|date\s*of\s*birth)\s*[:\-]?\s*)([0-9]{1,2}[/\-\.][0-9]{1,2}[/\-\.][0-9]{2,4}|[0-9]{1,2}(?:th|st|nd|rd)?\s*[a-zA-Z]+\s*[0-9]{4})")
PARENT_NAME_RE = re.compile(r"(?i)(father\'?s?\s*name|mother\'?s?\s*name)\s*[:\-]?\s*([^\n]+)")
CATEGORY_RE = re.compile(r"(?i)(category|caste)\s*[:\-]?\s*(general|gen|sc|st|obc|ews)\b")


class ResumeParser:
    def __init__(self) -> None:
        self._nlp = None
        try:
            import spacy

            self._nlp = spacy.blank("en")
            if "sentencizer" not in self._nlp.pipe_names:
                self._nlp.add_pipe("sentencizer")
        except Exception:
            self._nlp = None

    def extract_text(self, file_path: Path) -> str:
        return self.extract_text_from_bytes(file_path.name, file_path.read_bytes())

    def extract_text_from_bytes(self, file_name: str, file_bytes: bytes) -> str:
        suffix = Path(file_name).suffix.lower()
        if not file_bytes:
            return ""
        try:
            if suffix == ".pdf":
                return self._extract_pdf_bytes(file_bytes)
            if suffix == ".docx":
                return self._extract_docx_bytes(file_bytes)
            return file_bytes.decode("utf-8", errors="ignore")
        except Exception:
            return ""

    def parse(self, file_name: str, raw_text: str) -> ParsedResume:
        # Prevent CPU exhaustion / ReDoS / memory overload on massive text
        truncated_text = (raw_text or "")[:100000]
        cleaned_text = self._clean_text(truncated_text)
        
        if not cleaned_text or cleaned_text.strip() == "":
            raise ValueError(
                "The resume file is empty or could not be parsed. "
                "Please make sure it contains readable text and is not corrupted."
            )
            
        lines = [line.strip() for line in cleaned_text.splitlines() if line.strip()]
        urls = [match[0] for match in URL_RE.findall(cleaned_text)]
        github_url = self._extract_github(urls, cleaned_text)
        portfolio_url = guess_portfolio_url(urls)
        email = self._extract_email(cleaned_text)
        phone = self._extract_phone(cleaned_text)
        address = self._extract_address(lines)
        name = self._extract_name(lines, email, file_name)
        if not name:
            name = self._sanitize_filename_to_name(file_name)
            logger.info(f"Using filename fallback for name: {name}")
            
        education = self._extract_education(lines)
        experience_years = self._extract_experience_years(cleaned_text)
        experience_summary = self._extract_experience_summary(lines)
        skills = self._extract_skills(cleaned_text, lines)
        certifications = self._extract_certifications(lines)
        salary_expectation = self._extract_salary_expectation(cleaned_text)
        missing_info_flags = self._missing_flags(
            email=email,
            experience_years=experience_years,
            salary_expectation=salary_expectation,
            skills=skills,
        )
        redacted_text, redactions_applied = self._redact_text(
            cleaned_text,
            name=name,
            email=email,
            phone=phone,
            address=address,
            github_url=github_url,
            portfolio_url=portfolio_url,
        )

        return ParsedResume(
            name=name,
            email=email,
            phone=phone,
            education=education,
            experience_years=experience_years,
            experience_summary=experience_summary,
            skills=skills,
            certifications=certifications,
            github_url=github_url,
            portfolio_url=portfolio_url,
            salary_expectation=salary_expectation,
            address=address,
            raw_text=cleaned_text,
            redacted_text=redacted_text,
            missing_info_flags=missing_info_flags,
            redactions_applied=redactions_applied,
        )

    def _sanitize_filename_to_name(self, filename: str) -> str:
        """Extract a usable name from a filename like 'John_Doe_Resume.pdf'."""
        # Remove extension
        name = Path(filename).stem
        # Remove common suffixes
        name = re.sub(r"(?i)[-_]?(?:resume|cv|bio|profile|v\d+).*", "", name)
        # Replace separators with spaces
        name = name.replace("_", " ").replace("-", " ")
        # Title case and compact
        return compact_whitespace(name).title()

    def _extract_pdf(self, file_path: Path) -> str:
        with file_path.open("rb") as handle:
            reader = PdfReader(handle)
            pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)

    def _extract_pdf_bytes(self, file_bytes: bytes) -> str:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = [page.extract_text() or "" for page in reader.pages[:MAX_PDF_PAGES]]
        text = "\n".join(pages)

        # Extract hyperlink URLs from PDF annotations (clickable links
        # that are NOT in the visible text layer).
        annotation_urls: list[str] = []
        for page in reader.pages:
            try:
                annots = page.get("/Annots")
                if not annots:
                    continue
                for annot_ref in annots:
                    try:
                        annot = annot_ref.get_object()
                        action = annot.get("/A")
                        if action and "/URI" in action:
                            uri = str(action["/URI"])
                            if uri and uri not in text:
                                annotation_urls.append(uri)
                    except Exception:
                        continue
            except Exception:
                continue

        if annotation_urls:
            text += "\n" + "\n".join(annotation_urls)

        return text

    def _extract_docx(self, file_path: Path) -> str:
        with zipfile.ZipFile(file_path) as archive:
            xml_bytes = archive.read("word/document.xml")
        root = ElementTree.fromstring(xml_bytes)
        chunks = [node.text for node in root.iter() if node.text]
        return "\n".join(chunks)

    def _extract_docx_bytes(self, file_bytes: bytes) -> str:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            total_uncompressed = sum(info.file_size for info in archive.infolist())
            if total_uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise ValueError("DOCX archive exceeds safe size limit")
            xml_bytes = archive.read("word/document.xml")

            # Also read hyperlink relationships (URLs behind clickable text).
            hyperlink_urls: list[str] = []
            try:
                rels_bytes = archive.read("word/_rels/document.xml.rels")
                rels_root = ElementTree.fromstring(rels_bytes)
                for rel in rels_root:
                    rel_type = rel.get("Type", "")
                    target = rel.get("Target", "")
                    target_mode = rel.get("TargetMode", "")
                    if target_mode == "External" and (
                        "hyperlink" in rel_type.lower() or target.startswith("http")
                    ):
                        hyperlink_urls.append(target)
            except (KeyError, Exception):
                pass

        root = ElementTree.fromstring(xml_bytes)
        chunks = [node.text for node in root.iter() if node.text]
        text = "\n".join(chunks)

        # Append discovered hyperlink URLs so URL_RE can find them.
        if hyperlink_urls:
            text += "\n" + "\n".join(hyperlink_urls)

        return text

    def _clean_text(self, raw_text: str) -> str:
        if not raw_text:
            return ""
        raw_text = unescape(raw_text.replace("\x00", " "))
        raw_text = raw_text.replace("\r", "\n")
        raw_text = re.sub(r"\n{3,}", "\n\n", raw_text)
        return raw_text.strip()

    def _extract_email(self, text: str) -> str | None:
        match = EMAIL_RE.search(text)
        return match.group(1) if match else None

    def _extract_phone(self, text: str) -> str | None:
        match = PHONE_RE.search(text)
        return compact_whitespace(match.group(1)) if match else None
    def _extract_name(self, lines: list[str], email: str | None, file_name: str | None = None) -> str | None:
        """Heuristic to extract name from early lines, avoiding contact info/titles."""
        banned_terms = {"resume", "curriculum vitae", "developer", "engineer", "linkedin", "github", "profile"}
        for line in lines[:10]:
            normalized = compact_whitespace(line)
            lowered = normalized.lower()
            if not normalized or any(t in lowered for t in banned_terms):
                continue
            if email and email.lower() in (lowered or ""):
                continue
            if any(char.isdigit() for char in normalized):
                continue
            words = normalized.split()
            if 2 <= len(words) <= 4:
                if all(word[0].isupper() for word in words if word.isalpha()):
                    return normalized
        return None

    def _extract_education(self, lines: list[str]) -> str | None:
        education_lines = [line for line in lines if any(hint in line.lower() for hint in EDUCATION_HINTS)]
        if not education_lines:
            return None
        return "\n".join(education_lines[:4])

    def _extract_experience_years(self, text: str) -> float | None:
        year_matches = re.findall(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs)", text, flags=re.IGNORECASE)
        if year_matches:
            return max(float(value) for value in year_matches)
        range_matches = re.findall(r"(20\d{2})\s*[-to]+\s*(20\d{2}|present|current)", text, flags=re.IGNORECASE)
        if range_matches:
            durations = []
            for start, end in range_matches:
                start_year = int(start)
                end_year = datetime.now().year if end.lower() in {"present", "current"} else int(end)
                if end_year >= start_year:
                    durations.append(end_year - start_year)
            if durations:
                return float(max(durations))
        return None

    def _extract_experience_summary(self, lines: list[str]) -> str | None:
        summary_lines: list[str] = []
        capture = False
        for line in lines:
            lowered = line.lower()
            if any(hint in lowered for hint in EXPERIENCE_HINTS):
                capture = True
                continue
            if capture and re.match(r"^[A-Z][A-Za-z\s/&-]{1,25}$", line):
                break
            if capture:
                summary_lines.append(line)
            if len(summary_lines) >= 5:
                break
        if summary_lines:
            return "\n".join(summary_lines)
        interesting = [line for line in lines if any(token in line.lower() for token in ("developed", "built", "led", "designed", "implemented"))]
        if interesting:
            return "\n".join(interesting[:4])

        if self._nlp is not None:
            doc = self._nlp("\n".join(lines))
            sentences = [sent.text.strip() for sent in doc.sents if any(token in sent.text.lower() for token in ("developed", "built", "led", "designed", "implemented"))]
            if sentences:
                return "\n".join(sentences[:4])
        return None

    def _extract_skills(self, text: str, lines: list[str]) -> list[str]:
        lowered = text.lower()
        detected = [skill for skill in COMMON_SKILLS if skill in lowered]
        for line in lines:
            if "skill" in line.lower():
                _, _, suffix = line.partition(":")
                detected.extend(chunk.strip() for chunk in suffix.split(","))
        return unique_preserve_order(detected)

    def _extract_certifications(self, lines: list[str]) -> list[str]:
        certification_lines = [line for line in lines if any(hint in line.lower() for hint in CERTIFICATION_HINTS)]
        return unique_preserve_order(certification_lines[:6])

    def _extract_github(self, urls: list[str], text: str) -> str | None:
        for url in urls:
            if "github.com" in url.lower():
                return self._normalize_url(url)
        match = GITHUB_RE.search(text)
        if match:
            return f"https://github.com/{match.group(1)}"
        username_match = re.search(r"github[:\s]+([A-Za-z0-9_.-]+)", text, flags=re.IGNORECASE)
        if username_match:
            return f"https://github.com/{username_match.group(1)}"
        return None

    def _normalize_url(self, url: str) -> str:
        # Strip common trailing punctuation that gets captured by URL_RE,
        # but preserve dots and hyphens inside the URL.
        cleaned = url.rstrip(")>; ").rstrip(",")
        if cleaned.lower().startswith("www."):
            return f"https://{cleaned}"
        return cleaned

    def _extract_address(self, lines: list[str]) -> str | None:
        candidates = [line for line in lines[:12] if any(hint in line.lower() for hint in ADDRESS_HINTS)]
        return "\n".join(candidates[:2]) or None

    def _extract_salary_expectation(self, text: str) -> float | None:
        match = SALARY_RE.search(text)
        if match:
            return parse_salary_value(match.group(1))
        generic = re.search(r"([\$€£₹]?\s?\d+(?:[.,]\d+)?\s*(?:k|m|lpa|lakh|lakhs|lac|crore|cr))", text, flags=re.IGNORECASE)
        return parse_salary_value(generic.group(1)) if generic else None

    def _missing_flags(
        self,
        *,
        email: str | None,
        experience_years: float | None,
        salary_expectation: float | None,
        skills: list[str],
    ) -> list[str]:
        flags: list[str] = []
        if not email:
            flags.append("missing_email")
        if not experience_years:
            flags.append("missing_experience_years")
        if salary_expectation is None:
            flags.append("missing_salary_expectation")
        if not skills:
            flags.append("missing_skills")
        return flags

    def _redact_text(
        self,
        text: str,
        *,
        name: str | None,
        email: str | None,
        phone: str | None,
        address: str | None,
        github_url: str | None,
        portfolio_url: str | None,
    ) -> tuple[str, list[str]]:
        redacted = text
        actions: list[str] = []

        if email:
            redacted = redacted.replace(email, "[REDACTED_EMAIL]")
            actions.append("email")
        if phone:
            redacted = redacted.replace(phone, "[REDACTED_PHONE]")
            actions.append("phone")
        if name:
            redacted = re.sub(re.escape(name), "[REDACTED_NAME]", redacted, flags=re.IGNORECASE)
            actions.append("name")
        if address:
            redacted = redacted.replace(address, "[REDACTED_ADDRESS]")
            actions.append("address")
        if github_url:
            redacted = redacted.replace(github_url, "[GITHUB_LINK]")
            actions.append("github_link")
        if portfolio_url:
            redacted = redacted.replace(portfolio_url, "[PORTFOLIO_LINK]")
            actions.append("portfolio_link")

        redacted = PRONOUN_RE.sub("[REDACTED_GENDER_MARKER]", redacted)
        if redacted != text and "gender_markers" not in actions:
            actions.append("gender_markers")

        # Hyper-aggressive PII redaction for India-focused contexts
        if MARITAL_STATUS_RE.search(redacted):
            redacted = MARITAL_STATUS_RE.sub(r"\g<1>[REDACTED_MARITAL_STATUS]", redacted)
            actions.append("marital_status")
            
        if RELIGION_RE.search(redacted):
            redacted = RELIGION_RE.sub(r"\g<1>[REDACTED_RELIGION]", redacted)
            actions.append("religion")
            
        if DOB_RE.search(redacted):
            redacted = DOB_RE.sub(r"\g<1>[REDACTED_DOB]", redacted)
            actions.append("dob")
            
        if PARENT_NAME_RE.search(redacted):
            redacted = PARENT_NAME_RE.sub(r"\g<1>[REDACTED_PARENT_NAME]", redacted)
            actions.append("parent_name")
            
        if CATEGORY_RE.search(redacted):
            redacted = CATEGORY_RE.sub(r"\g<1>[REDACTED_CATEGORY]", redacted)
            actions.append("category")

        for match in EMAIL_RE.findall(redacted):
            redacted = redacted.replace(match, "[REDACTED_EMAIL]")
        for match in PHONE_RE.findall(redacted):
            redacted = redacted.replace(match, "[REDACTED_PHONE]")

        return redacted, unique_preserve_order(actions)
