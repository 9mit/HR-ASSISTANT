"""Counterfactual fit simulator — what would change a candidate's outcome."""
from __future__ import annotations

import copy
import logging
from typing import Any

from .models import RankingDecision
from .ranking import RankingEngine

logger = logging.getLogger(__name__)

MAX_LEVERS = 5
MIN_DELTA = 0.05  # ignore noise from floating point


def _decision_value(decision: Any) -> str:
    if isinstance(decision, RankingDecision):
        return decision.value
    return str(decision or "rejected")


class CounterfactualEngine:
    """
    Deterministic what-if analysis on top of RankingEngine.

    Applies one controlled mutation at a time and re-ranks without
    uniqueness tiebreakers so score deltas are comparable.
    """

    def __init__(self, ranking_engine: RankingEngine | None = None):
        self.ranking = ranking_engine or RankingEngine()

    def simulate(
        self,
        candidate_data: dict[str, Any],
        job_requirements: dict[str, Any],
        *,
        max_levers: int = MAX_LEVERS,
    ) -> list[dict[str, Any]]:
        baseline = self.ranking.rank_candidate(
            candidate_data, job_requirements, apply_tiebreaker=False
        )
        current_score = float(baseline.get("overall_score") or 0.0)
        current_decision = _decision_value(baseline.get("decision"))

        mutations = self._build_mutations(candidate_data, job_requirements)
        levers: list[dict[str, Any]] = []

        for mutation in mutations:
            mutated = mutation["apply"](copy.deepcopy(candidate_data))
            if mutated is None:
                continue
            predicted = self.ranking.rank_candidate(
                mutated, job_requirements, apply_tiebreaker=False
            )
            predicted_score = float(predicted.get("overall_score") or 0.0)
            predicted_decision = _decision_value(predicted.get("decision"))
            delta = predicted_score - current_score

            decision_changed = predicted_decision != current_decision
            if abs(delta) < MIN_DELTA and not decision_changed:
                continue

            levers.append(
                {
                    "id": mutation["id"],
                    "label": mutation["label"],
                    "category": mutation["category"],
                    "current_score": round(current_score, 2),
                    "predicted_score": round(predicted_score, 2),
                    "current_decision": current_decision,
                    "predicted_decision": predicted_decision,
                    "delta": round(delta, 2),
                    "explanation": mutation["explanation"],
                }
            )

        # Prefer decision upgrades, then largest positive delta
        decision_rank = {
            "needs_clarification": 0,
            "salary_mismatch": 0,
            "rejected": 1,
            "review": 2,
            "under_consideration": 3,
            "shortlist": 4,
            "invalid": -1,
        }

        def sort_key(lever: dict[str, Any]) -> tuple:
            upgrade = decision_rank.get(lever["predicted_decision"], 0) - decision_rank.get(
                lever["current_decision"], 0
            )
            return (upgrade, lever["delta"])

        levers.sort(key=sort_key, reverse=True)
        return levers[:max_levers]

    def _build_mutations(
        self,
        candidate_data: dict[str, Any],
        job_requirements: dict[str, Any],
    ) -> list[dict[str, Any]]:
        mutations: list[dict[str, Any]] = []
        required_skills = list(job_requirements.get("required_skills") or [])
        salary_min = job_requirements.get("salary_min")
        salary_max = job_requirements.get("salary_max")
        candidate_salary = candidate_data.get("salary_expectation")
        skills = [str(s) for s in (candidate_data.get("skills") or [])]
        skills_lower = {s.lower().strip() for s in skills}
        years = float(candidate_data.get("experience_years") or 0)
        projects = candidate_data.get("projects") or []
        resume_projects = candidate_data.get("resume_projects") or []
        certs = list(candidate_data.get("certifications") or [])

        # --- Salary gate ---
        salary_ok, _ = self.ranking._check_salary(candidate_salary, salary_min, salary_max)
        if not salary_ok and (salary_min is not None or salary_max is not None):
            if salary_min is not None and salary_max is not None:
                mid = (float(salary_min) + float(salary_max)) / 2.0
            elif salary_min is not None:
                mid = float(salary_min)
            else:
                mid = float(salary_max)  # type: ignore[arg-type]

            if candidate_salary is None:
                label = "Provide salary expectation within band"
                explanation = (
                    f"Salary is missing (needs clarification). "
                    f"If set to {mid:,.0f} (mid-band), ranking proceeds on merit factors."
                )
            else:
                label = "Align salary expectation within band"
                explanation = (
                    f"Current expectation ({candidate_salary:,.0f}) is outside the role band. "
                    f"If adjusted to {mid:,.0f}, the salary gate clears."
                )

            def apply_salary(data: dict[str, Any], mid_val: float = mid) -> dict[str, Any]:
                data["salary_expectation"] = mid_val
                return data

            mutations.append(
                {
                    "id": "salary_in_band",
                    "label": label,
                    "category": "gate",
                    "explanation": explanation,
                    "apply": apply_salary,
                }
            )

        # --- Missing required skills (up to 2 separate levers) ---
        missing = [
            skill
            for skill in required_skills
            if skill and skill.lower().strip() not in skills_lower
        ]
        for skill in missing[:2]:
            def make_skill_apply(skill_name: str):
                def apply_skill(data: dict[str, Any]) -> dict[str, Any]:
                    current = list(data.get("skills") or [])
                    if skill_name.lower() not in {s.lower() for s in current}:
                        current.append(skill_name)
                    data["skills"] = current
                    return data

                return apply_skill

            mutations.append(
                {
                    "id": f"add_skill_{skill.lower().replace(' ', '_')[:40]}",
                    "label": f"Prove skill: {skill}",
                    "category": "skills",
                    "explanation": (
                        f"Required skill '{skill}' is not evidenced on the resume. "
                        f"If demonstrated, skill-match weight (40%) would improve."
                    ),
                    "apply": make_skill_apply(skill),
                }
            )

        # --- Project / GitHub lever ---
        if not projects:
            def apply_github_projects(data: dict[str, Any]) -> dict[str, Any]:
                data["projects"] = [
                    {
                        "name": "flagship-project",
                        "description": "Substantial public project with documentation",
                        "stars": 25,
                        "forks": 5,
                        "language": "Python",
                        "readme_quality_score": 80,
                    },
                    {
                        "name": "supporting-library",
                        "description": "Reusable library used across teams",
                        "stars": 12,
                        "forks": 2,
                        "language": "TypeScript",
                        "readme_quality_score": 70,
                    },
                ]
                return data

            if resume_projects:
                explanation = (
                    "Public GitHub repos would strengthen project quality beyond "
                    "resume-described work (GitHub remains a premium signal)."
                )
                label = "Link a strong GitHub portfolio"
            else:
                explanation = (
                    "No GitHub or resume projects found — score uses a neutral 50. "
                    "A documented public portfolio would raise the project factor (30% weight)."
                )
                label = "Add documented projects or GitHub"

            mutations.append(
                {
                    "id": "github_portfolio",
                    "label": label,
                    "category": "projects",
                    "explanation": explanation,
                    "apply": apply_github_projects,
                }
            )

        # --- Experience bump to next tier ---
        if years < 10:
            if years < 1:
                target_years = 1.5
            elif years < 2:
                target_years = 3.0
            elif years < 5:
                target_years = 6.0
            else:
                target_years = 10.0

            def apply_experience(data: dict[str, Any], target: float = target_years) -> dict[str, Any]:
                data["experience_years"] = target
                return data

            mutations.append(
                {
                    "id": "experience_tier",
                    "label": f"Clarify experience to ~{target_years:g} years",
                    "category": "experience",
                    "explanation": (
                        f"Current experience signal is {years:g} years. "
                        f"If validated at ~{target_years:g} years, experience weight (20%) rises."
                    ),
                    "apply": apply_experience,
                }
            )

        # --- Certification ---
        if len(certs) < 3:
            def apply_cert(data: dict[str, Any]) -> dict[str, Any]:
                current = list(data.get("certifications") or [])
                current.append("Role-relevant professional certification")
                data["certifications"] = current
                if not data.get("education"):
                    data["education"] = "Recognized degree"
                return data

            mutations.append(
                {
                    "id": "add_certification",
                    "label": "Add a relevant certification",
                    "category": "certifications",
                    "explanation": (
                        "An additional role-aligned certification would improve the "
                        "certifications factor (10% weight)."
                    ),
                    "apply": apply_cert,
                }
            )

        return mutations


def build_ranking_inputs_from_candidate(
    *,
    skills: list | None,
    experience_years: float | None,
    certifications: list | None,
    education: Any,
    salary_expectation: float | None,
    github_repos: list | None = None,
    resume_projects: list | None = None,
    parsed_resume: str | None = None,
) -> dict[str, Any]:
    """Normalize ORM / raw_record fields into RankingEngine candidate_data."""
    return {
        "skills": list(skills or []),
        "experience_years": experience_years or 0,
        "projects": list(github_repos or []),
        "resume_projects": list(resume_projects or []),
        "certifications": list(certifications or []),
        "salary_expectation": salary_expectation,
        "education": education,
        "parsed_resume": parsed_resume or "",
    }
