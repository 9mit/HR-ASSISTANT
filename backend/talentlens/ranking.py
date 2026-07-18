"""Candidate ranking and scoring engine."""
import logging
import re
from typing import Dict, Any, List, Optional
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

from .models import RankingDecision
from .settings import settings

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# Project keywords for resume-based project extraction
# ──────────────────────────────────────────────────────────────
PROJECT_ACTION_VERBS = (
    "developed", "built", "created", "designed", "implemented",
    "deployed", "architected", "engineered", "contributed",
    "maintained", "refactored", "migrated", "automated",
    "integrated", "optimized", "launched", "shipped",
)

TECH_KEYWORDS = (
    "react", "angular", "vue", "next.js", "node", "express",
    "django", "flask", "fastapi", "spring", "docker", "kubernetes",
    "aws", "azure", "gcp", "postgres", "mongodb", "redis",
    "graphql", "rest", "microservice", "ci/cd", "machine learning",
    "deep learning", "tensorflow", "pytorch", "api", "database",
    "frontend", "backend", "full-stack", "mobile", "android", "ios",
)


def extract_resume_projects(resume_text: str) -> List[Dict[str, Any]]:
    """
    Extract project-like descriptions from resume text.
    This ensures candidates without GitHub are still evaluated on their
    project work mentioned in the resume.

    Returns a list of pseudo-project dicts compatible with _score_projects().
    """
    if not resume_text:
        return []

    lines = [line.strip() for line in resume_text.split("\n") if line.strip()]
    projects: list[dict[str, Any]] = []

    for line in lines:
        lowered = line.lower()
        # Look for lines that describe project work
        has_action_verb = any(verb in lowered for verb in PROJECT_ACTION_VERBS)
        has_tech = any(tech in lowered for tech in TECH_KEYWORDS)

        if has_action_verb and has_tech and len(line) > 30:
            # Score based on richness of the description
            tech_count = sum(1 for tech in TECH_KEYWORDS if tech in lowered)
            verb_count = sum(1 for verb in PROJECT_ACTION_VERBS if verb in lowered)
            detail_score = min((tech_count * 15) + (verb_count * 10) + (len(line) // 20), 100)

            projects.append({
                "name": line[:60].strip(),
                "description": line,
                "source": "resume",
                "stars": 0,
                "forks": 0,
                "language": None,
                "readme_quality_score": detail_score,
            })

    return projects[:6]  # Cap at 6 resume-mentioned projects


def generate_interview_questions(
    role: str,
    skills: List[str],
    experience_summary: str | None,
    projects: List[Dict[str, Any]],
) -> List[str]:
    """
    Generate interview questions locally based on the candidate's profile.
    No external APIs needed.
    """
    questions: list[str] = []

    # Role-based questions
    role_lower = role.lower()
    if "frontend" in role_lower or "react" in role_lower:
        questions.append("Describe your approach to state management in large-scale React applications.")
    elif "backend" in role_lower or "api" in role_lower:
        questions.append("How do you handle database migrations and schema changes in production?")
    elif "full stack" in role_lower or "fullstack" in role_lower:
        questions.append("Walk me through how you'd design a feature end-to-end, from API to UI.")
    elif "data" in role_lower or "ml" in role_lower or "machine learning" in role_lower:
        questions.append("How do you validate that a model's performance is production-ready?")
    elif "devops" in role_lower or "cloud" in role_lower or "infra" in role_lower:
        questions.append("Describe your approach to zero-downtime deployments.")
    else:
        questions.append(f"What drew you to a {role} position, and how does your background prepare you?")

    # Skill-based questions
    if skills:
        top_skills = skills[:3]
        for skill in top_skills:
            questions.append(f"Tell me about a challenging problem you solved using {skill}.")

    # Experience-based questions
    if experience_summary:
        questions.append("What was the most impactful project in your career so far, and why?")

    # Project-based questions
    if projects:
        proj_names = [p.get("name", "your project") for p in projects[:2]]
        for name in proj_names:
            clean_name = name[:50]
            questions.append(f"Can you walk me through the architecture and decisions behind '{clean_name}'?")

    return questions[:5]  # Cap at 5


class RankingEngine:
    """Score and rank candidates based on job requirements.
    
    UNIQUE SCORING GUARANTEE:
    - No two resumes receive the same score
    - Tiebreaker analysis applied to differentiate tied candidates
    - Consistency checks ensure score uniqueness across batch
    """

    def __init__(self):
        """Initialize ranking engine."""
        self.skill_weight = 0.40
        self.project_weight = 0.30
        self.experience_weight = 0.20
        self.certification_weight = 0.10
        
        # Tiebreaker weights for deeper differentiation
        self.tiebreaker_weights = {
            "portfolio_depth": 0.25,      # Number and variety of projects
            "certification_depth": 0.20,   # Certifications and education
            "skill_specialty": 0.20,       # Depth in specialized skills
            "experience_continuity": 0.15, # Consistency of experience
            "resume_quality": 0.20,        # Overall resume richness
        }

    def rank_candidate(
        self,
        candidate_data: Dict[str, Any],
        job_requirements: Dict[str, Any],
        apply_tiebreaker: bool = True,
    ) -> Dict[str, Any]:
        """
        Rank a single candidate against job requirements.
        
        Args:
            candidate_data: Candidate information
            job_requirements: Job requirements from batch
            apply_tiebreaker: When False, skip uniqueness offset (used by counterfactuals)
            
        Returns:
            Ranking result with scores and decision
        """
        result = {
            "skill_match_score": 0.0,
            "experience_score": 0.0,
            "project_quality_score": 0.0,
            "overall_score": 0.0,
            "decision": RankingDecision.REJECTED,
            "explanation": "",
            "score_breakdown": {},
        }

        try:
            # Extract required information
            candidate_skills = candidate_data.get("skills", [])
            candidate_experience_years = candidate_data.get("experience_years", 0)
            candidate_projects = candidate_data.get("projects", [])
            candidate_salary = candidate_data.get("salary_expectation")
            resume_projects = candidate_data.get("resume_projects", [])
            
            required_skills = job_requirements.get("required_skills", [])
            salary_min = job_requirements.get("salary_min")
            salary_max = job_requirements.get("salary_max")

            # Calculate individual scores
            skill_score = self._score_skill_match(
                candidate_skills, required_skills
            )
            experience_score = self._score_experience(candidate_experience_years)

            # Project scoring: use GitHub if available, fall back to
            # resume-extracted projects, and finally use a neutral score
            # so that candidates without any project data are NOT penalized.
            project_score = self._score_projects_fair(
                github_projects=candidate_projects,
                resume_projects=resume_projects,
            )

            cert_score = self._score_certifications(candidate_data)

            # Check salary compatibility
            salary_acceptable, salary_explanation = self._check_salary(
                candidate_salary, salary_min, salary_max
            )

            if not salary_acceptable:
                result["decision"] = RankingDecision.NEEDS_CLARIFICATION
                result["explanation"] = salary_explanation
                # We still calculate the score for transparency even if clarify is needed
                overall_score = (
                    skill_score * self.skill_weight
                    + experience_score * self.experience_weight
                    + project_score * self.project_weight
                    + cert_score * self.certification_weight
                )
                result["overall_score"] = overall_score
                result["skill_match_score"] = skill_score
                result["experience_score"] = experience_score
                result["project_quality_score"] = project_score
                result["score_breakdown"] = {
                    "skill": {"score": skill_score, "weight": self.skill_weight},
                    "experience": {"score": experience_score, "weight": self.experience_weight},
                    "projects": {"score": project_score, "weight": self.project_weight},
                    "certifications": {"score": cert_score, "weight": self.certification_weight},
                }
                
                if apply_tiebreaker:
                    result = self.apply_uniqueness_tiebreaker(result, candidate_data)
                return result

            # Calculate weighted overall score
            overall_score = (
                skill_score * self.skill_weight
                + experience_score * self.experience_weight
                + project_score * self.project_weight
                + cert_score * self.certification_weight
            )

            # Determine decision tier
            decision, explanation = self._make_decision(
                overall_score, skill_score, experience_score, project_score
            )

            # Build result
            result["skill_match_score"] = skill_score
            result["experience_score"] = experience_score
            result["project_quality_score"] = project_score
            result["overall_score"] = overall_score
            result["decision"] = decision
            result["explanation"] = explanation
            result["score_breakdown"] = {
                "skill": {"score": skill_score, "weight": self.skill_weight},
                "experience": {"score": experience_score, "weight": self.experience_weight},
                "projects": {"score": project_score, "weight": self.project_weight},
                "certifications": {"score": cert_score, "weight": self.certification_weight},
            }

            if apply_tiebreaker:
                result = self.apply_uniqueness_tiebreaker(result, candidate_data)

            return result

        except Exception as e:
            logger.error(f"Error ranking candidate: {str(e)}")
            result["explanation"] = f"Ranking error: {str(e)}"
            return result

    def _score_skill_match(self, candidate_skills: List[str], required_skills: List[str]) -> float:
        """
        Score skill match using TF-IDF cosine similarity.
        
        Args:
            candidate_skills: Candidate's skills
            required_skills: Required skills
            
        Returns:
            Skill match score (0-100)
        """
        if not required_skills:
            return 50.0  # Default if no required skills
        
        if not candidate_skills:
            return 0.0
        
        try:
            # Normalize skills for fair comparison
            candidate_normalized = [s.lower().strip() for s in candidate_skills]
            required_normalized = [s.lower().strip() for s in required_skills]

            # Create TF-IDF vectors
            vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(2, 3))
            vectors = vectorizer.fit_transform([" ".join(candidate_normalized), " ".join(required_normalized)])
            
            # Calculate cosine similarity
            similarity = cosine_similarity(vectors)[0][1]
            
            # Convert to percentage
            score = similarity * 100
            
            # Boost for exact matches
            exact_matches = len(set(candidate_normalized) & set(required_normalized))
            score = min(score + (exact_matches * 5), 100.0)
            
            return score

        except Exception as e:
            logger.warning(f"Error calculating skill match: {str(e)}")
            # Fallback: simple matching
            matches = len(set(candidate_skills) & set(required_skills))
            if required_skills:
                return (matches / len(required_skills)) * 100
            return 0.0

    def _score_experience(self, years_of_experience: float) -> float:
        """
        Score candidate experience level.
        
        Args:
            years_of_experience: Years of experience
            
        Returns:
            Experience score (0-100)
        """
        if years_of_experience is None:
            return 50.0  # Unknown experience = neutral
        
        if years_of_experience < 1:
            return 20.0
        elif years_of_experience < 2:
            return 40.0
        elif years_of_experience < 5:
            return 60.0
        elif years_of_experience < 10:
            return 80.0
        else:
            return 100.0

    def _score_projects_fair(
        self,
        github_projects: List[Dict[str, Any]],
        resume_projects: List[Dict[str, Any]],
    ) -> float:
        """
        Score project portfolio quality fairly.

        Strategy:
        - If GitHub projects exist, use them (primary signal).
        - If no GitHub but resume mentions projects, score those.
        - If neither exists, return a NEUTRAL score (50.0) to avoid
          penalizing candidates who simply don't list a GitHub URL.
          This prevents bias against candidates without public GitHub profiles.

        Args:
            github_projects: Repos from GitHub scraping
            resume_projects: Projects extracted from resume text

        Returns:
            Project score (0-100)
        """
        # Primary: GitHub-based scoring
        if github_projects:
            return self._score_projects(github_projects)

        # Fallback: Resume-based project scoring
        if resume_projects:
            return self._score_resume_projects(resume_projects)

        # No project data at all → neutral score (not zero!)
        # This ensures candidates without GitHub/project mentions are
        # compared equally on their other factors.
        return 50.0

    def _score_projects(self, projects: List[Dict[str, Any]]) -> float:
        """
        Score project portfolio quality from GitHub data.
        
        Args:
            projects: List of projects
            
        Returns:
            Project score (0-100)
        """
        if not projects:
            return 0.0
        
        try:
            scores = []
            
            for project in projects:
                project_score = 0.0
                
                # Stars score (max 40)
                stars = project.get("stars", 0)
                project_score += min(stars / 10, 40)
                
                # Forks score (max 20)
                forks = project.get("forks", 0)
                project_score += min(forks / 5, 20)
                
                # README quality (max 30)
                readme_quality = project.get("readme_quality_score", 0)
                project_score += readme_quality * 0.3
                
                # Language diversity (max 10)
                if project.get("language"):
                    project_score += 10
                
                scores.append(min(project_score, 100.0))
            
            # Average the top 3 projects
            top_scores = sorted(scores, reverse=True)[:3]
            return np.mean(top_scores) if top_scores else 0.0

        except Exception as e:
            logger.warning(f"Error scoring projects: {str(e)}")
            return 0.0

    def _score_resume_projects(self, resume_projects: List[Dict[str, Any]]) -> float:
        """
        Score projects that were extracted from resume text (no GitHub).

        This gives a fair project evaluation to candidates who describe
        their work but don't have a GitHub profile.

        Args:
            resume_projects: Projects extracted from resume

        Returns:
            Project score (0-100)
        """
        if not resume_projects:
            return 50.0  # Neutral

        scores = []
        for proj in resume_projects:
            # README quality score here represents description richness
            detail_score = proj.get("readme_quality_score", 30)
            scores.append(min(detail_score, 100.0))

        top_scores = sorted(scores, reverse=True)[:3]
        raw_avg = np.mean(top_scores) if top_scores else 40.0

        # Cap resume-based projects to 80% to keep GitHub data as a
        # premium signal while still being fair.
        return min(raw_avg, 80.0)

    def _score_certifications(self, candidate_data: Dict[str, Any]) -> float:
        """
        Score certifications and qualifications.
        
        NOTE: This method intentionally does NOT boost scores based on
        institution names (e.g., IIT, NIT) to prevent institutional bias.
        All recognized degrees are treated equally.
        
        Args:
            candidate_data: Candidate information
            
        Returns:
            Certification score (0-100)
        """
        certs = candidate_data.get("certifications", [])
        education = candidate_data.get("education", [])
        
        score = 0.0
        
        # Education score (max 60) — bias-free, no institutional boosting
        if education:
            base_edu_score = 40  # Any recognized education gets the same base
            if isinstance(education, list):
                score += min(base_edu_score + (len(education) * 5), 60)
            elif education:
                score += base_edu_score
        
        # Certification score (max 40)
        if isinstance(certs, list):
            score += min(len(certs) * 10, 40)
        elif certs:
            score += 20
        
        return min(score, 100.0)

    def _check_salary(
        self,
        candidate_salary: Optional[float],
        salary_min: Optional[float],
        salary_max: Optional[float],
    ) -> tuple[bool, str]:
        """
        Check if candidate salary expectation is within range.
        
        Args:
            candidate_salary: Candidate's salary expectation
            salary_min: Minimum salary from job posting
            salary_max: Maximum salary from job posting
            
        Returns:
            Tuple of (is_acceptable, explanation)
        """
        if salary_min is None and salary_max is None:
            return True, "No salary requirements specified"
        
        if candidate_salary is None:
            return False, "Salary expectation not provided - needs clarification"
        
        if salary_min is not None and candidate_salary < salary_min:
            return (
                False,
                f"Candidate salary expectation ({candidate_salary}) below minimum ({salary_min})",
            )
        
        if salary_max is not None and candidate_salary > salary_max:
            return (
                False,
                f"Candidate salary expectation ({candidate_salary}) above maximum ({salary_max})",
            )
        
        return True, "Salary within range"

    def _make_decision(
        self,
        overall_score: float,
        skill_score: float,
        experience_score: float,
        project_score: float,
    ) -> tuple[RankingDecision, str]:
        """
        Make hiring decision based on scores.
        
        Args:
            overall_score: Overall score
            skill_score: Skill match score
            experience_score: Experience score
            project_score: Project quality score
            
        Returns:
            Tuple of (decision, explanation)
        """
        if overall_score >= 75:
            return (
                RankingDecision.SHORTLIST,
                f"Strong candidate with {overall_score:.1f}% overall match",
            )
        elif overall_score >= 55:
            reasons = []
            if skill_score >= 70:
                reasons.append("good skill match")
            if project_score >= 70:
                reasons.append("strong portfolio")
            if experience_score >= 70:
                reasons.append("relevant experience")
            
            reason_text = ", ".join(reasons) if reasons else "moderate overall match"
            return (
                RankingDecision.REVIEW,
                f"Candidate for review ({overall_score:.1f}% overall) - {reason_text}",
            )
        else:
            return (
                RankingDecision.REJECTED,
                f"Does not meet minimum threshold ({overall_score:.1f}% overall)",
            )

    def _calculate_tiebreaker_score(self, candidate_data: Dict[str, Any]) -> float:
        """
        Calculate a detailed tiebreaker score for differentiating candidates
        with similar overall scores.

        STRATEGY:
        - Analyze portfolio depth (# of projects and their diversity)
        - Evaluate certification depth (# and types of certs/education)
        - Score skill specialty (depth in specific technical areas)
        - Check experience continuity (timeline coherence)
        - Measure resume quality (text richness and detail)

        Returns a decimal value (0-10) that's used as a fractional adjustment
        to ensure unique scores.

        Args:
            candidate_data: Full candidate information

        Returns:
            Tiebreaker adjustment score (0-10)
        """
        score = 0.0

        # 1. Portfolio Depth (max 2.5)
        github_projects = candidate_data.get("projects", [])
        resume_projects = candidate_data.get("resume_projects", [])
        total_projects = len(github_projects) + len(resume_projects)
        portfolio_score = min((total_projects / 8) * 2.5, 2.5)  # Normalize to 2.5
        score += portfolio_score

        # 2. Certification Depth (max 2.0)
        certs = candidate_data.get("certifications", [])
        education = candidate_data.get("education", [])
        cert_count = (len(certs) if isinstance(certs, list) else (1 if certs else 0))
        edu_count = (len(education) if isinstance(education, list) else (1 if education else 0))
        cert_depth_score = min(((cert_count + edu_count) / 5) * 2.0, 2.0)
        score += cert_depth_score

        # 3. Skill Specialty (max 2.0)
        skills = candidate_data.get("skills", [])
        skill_count = len(skills) if isinstance(skills, list) else 0
        skill_specialty = min((skill_count / 15) * 2.0, 2.0)  # Depth in multiple skills
        score += skill_specialty

        # 4. Experience Continuity (max 2.0)
        years = candidate_data.get("experience_years", 0)
        # Longer continuous experience is valued more
        continuity_score = min((years / 15) * 2.0, 2.0)
        score += continuity_score

        # 5. Resume Quality (max 1.5)
        resume_text = candidate_data.get("parsed_resume", "")
        resume_length = len(str(resume_text).split())
        # More detailed resume (more words) = higher quality indication
        quality_score = min((resume_length / 500) * 1.5, 1.5)
        score += quality_score

        return round(score, 3)  # Return with 3 decimal precision

    def apply_uniqueness_tiebreaker(
        self, ranking_result: Dict[str, Any], candidate_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Apply tiebreaker adjustment to ensure score uniqueness.

        Args:
            ranking_result: Initial ranking result with overall_score
            candidate_data: Full candidate data for tiebreaker analysis

        Returns:
            Updated ranking result with adjusted unique score
        """
        tiebreaker = self._calculate_tiebreaker_score(candidate_data)
        
        # Apply tiebreaker as fractional adjustment (max +0.99 points)
        adjustment = (tiebreaker / 100) * 0.99
        adjusted_score = ranking_result["overall_score"] + adjustment
        
        # Update the ranking result
        ranking_result["overall_score"] = round(adjusted_score, 2)
        ranking_result["tiebreaker_score"] = tiebreaker
        ranking_result["uniqueness_adjustment"] = adjustment
        
        return ranking_result


# ──────────────────────────────────────────────────────────────
# BATCH-LEVEL CONSISTENCY & UNIQUENESS VALIDATION
# ──────────────────────────────────────────────────────────────

def check_batch_score_uniqueness(rankings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Validate that NO two candidates in a batch have the same score.
    
    If duplicates are detected, apply micro-adjustments to ensure uniqueness
    while preserving the relative ranking order.
    
    Args:
        rankings: List of ranking results from all candidates in batch
        
    Returns:
        Validation result with duplicate count, fixed rankings, and report
    """
    if not rankings:
        return {
            "is_unique": True,
            "duplicate_count": 0,
            "duplicates": [],
            "fixed_rankings": rankings,
            "adjustments_made": 0,
            "report": "No rankings to validate",
        }

    # Extract scores and find duplicates
    scores = [r.get("overall_score", 0) for r in rankings]
    score_counts = {}
    duplicates = []

    for idx, score in enumerate(scores):
        if score not in score_counts:
            score_counts[score] = []
        score_counts[score].append(idx)

    # Identify duplicate scores
    for score, indices in score_counts.items():
        if len(indices) > 1:
            duplicates.extend(indices)

    # If no duplicates, return as-is
    if not duplicates:
        return {
            "is_unique": True,
            "duplicate_count": 0,
            "duplicates": [],
            "fixed_rankings": rankings,
            "adjustments_made": 0,
            "report": f"✓ All {len(rankings)} candidates have unique scores",
        }

    # Duplicates found — apply micro-adjustments
    fixed_rankings = [r.copy() for r in rankings]
    adjustments_made = 0

    # Sort by score descending, then by original index
    sorted_indices = sorted(range(len(scores)), key=lambda i: (-scores[i], i))

    for rank, idx in enumerate(sorted_indices):
        original_score = fixed_rankings[idx]["overall_score"] or 0.0
        # Apply micro-adjustment: -0.001 per rank position to maintain order
        adjusted_score = original_score - (rank * 0.001)
        # Ensure it doesn't go below 0.0
        adjusted_score = max(0.0, adjusted_score)
        
        if abs(adjusted_score - original_score) > 0.0001:
            adjustments_made += 1

        fixed_rankings[idx]["overall_score"] = round(adjusted_score, 3)
        fixed_rankings[idx]["uniqueness_verified"] = True
        fixed_rankings[idx]["micro_adjustment"] = round(adjusted_score - original_score, 3)

    # Re-validate after adjustments
    new_scores = [r["overall_score"] for r in fixed_rankings]
    is_now_unique = len(new_scores) == len(set(new_scores))

    report = f"Found {len([i for i in duplicates if i < len(rankings)])} candidates with duplicate scores. "
    if is_now_unique:
        report += f"Applied {adjustments_made} micro-adjustments. ✓ All scores now unique."
    else:
        report += "Warning: Could not fully resolve duplicates."

    return {
        "is_unique": is_now_unique,
        "duplicate_count": len(set(duplicates)),
        "duplicates": list(set(duplicates)),
        "fixed_rankings": fixed_rankings,
        "adjustments_made": adjustments_made,
        "report": report,
    }


def generate_score_report(rankings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generate a detailed score report showing:
    - All scores sorted (highest to lowest)
    - Uniqueness status
    - Tiebreaker contributions
    - Ranking stability
    
    Args:
        rankings: List of ranking results
        
    Returns:
        Detailed report dictionary
    """
    if not rankings:
        return {
            "total_candidates": 0,
            "score_summary": [],
            "uniqueness_status": "N/A",
            "score_spread": {"min": None, "max": None, "range": None},
        }

    # Sort by score descending
    sorted_rankings = sorted(
        rankings,
        key=lambda r: (-r.get("overall_score", 0), r.get("candidate_id", "")),
    )

    scores = [r.get("overall_score", 0) for r in sorted_rankings]
    unique_scores = len(set(scores)) == len(scores)

    score_summary = []
    for rank, result in enumerate(sorted_rankings, 1):
        score_summary.append({
            "rank": rank,
            "candidate_id": result.get("candidate_id", f"Candidate {rank}"),
            "overall_score": result.get("overall_score", 0),
            "decision": result.get("decision", "UNKNOWN"),
            "tiebreaker_score": result.get("tiebreaker_score", 0),
            "adjustment": result.get("uniqueness_adjustment", 0),
        })

    return {
        "total_candidates": len(rankings),
        "score_summary": score_summary,
        "uniqueness_status": "✓ Unique" if unique_scores else "✗ Duplicates Found",
        "score_spread": {
            "min": min(scores) if scores else None,
            "max": max(scores) if scores else None,
            "range": (max(scores) - min(scores)) if scores else None,
        },
        "all_scores": sorted(set(scores), reverse=True),
    }

