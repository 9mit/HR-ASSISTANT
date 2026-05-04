"""GitHub repository scraper service."""
import logging
import requests
from bs4 import BeautifulSoup
from typing import Optional, Dict, Any, List
import re
import time

from .settings import settings

logger = logging.getLogger(__name__)


class GitHubScraper:
    """Scrape GitHub profiles and repository data."""

    def __init__(self):
        self.timeout = settings.GITHUB_SCRAPE_TIMEOUT
        self.fallback_api = settings.GITHUB_FALLBACK_API

    def analyze_profile(self, github_url: str) -> Dict[str, Any]:
        """
        Analyze GitHub profile and scrape repositories.
        
        Uses a multi-tier fallback strategy:
        1. GitHub REST API (public, 60 req/hr unauthenticated)
        2. Direct HTML scraping (no rate limit, but fragile)
        3. External fallback API (githubrepoanalyser)
        
        Args:
            github_url: URL to GitHub profile
            
        Returns:
            Dictionary with GitHub profile data and repositories
        """
        if not github_url or not self._is_valid_github_url(github_url):
            return self._empty_response()

        try:
            # Extract username from URL
            username = self._extract_username(github_url)
            if not username:
                return self._empty_response()

            # Try to extract email from the GitHub user profile API
            github_email = self._extract_user_email(username)

            # Tier 1: GitHub REST API
            repos = self._scrape_repos_api(username)
            if repos:
                logger.info(f"GitHub data for {username} via REST API ({len(repos)} repos)")
                return {
                    "username": username,
                    "github_url": github_url,
                    "email": github_email,
                    "repositories": repos,
                    "source": "github_api",
                    "profile_quality_score": self._score_profile(repos),
                }

            # Tier 2: Direct HTML scraping
            logger.info(f"GitHub API failed for {username}, trying HTML scrape")
            repos = self._scrape_repos_html(username)
            if repos:
                logger.info(f"GitHub data for {username} via HTML scrape ({len(repos)} repos)")
                return {
                    "username": username,
                    "github_url": github_url,
                    "email": github_email,
                    "repositories": repos,
                    "source": "html_scrape",
                    "profile_quality_score": self._score_profile(repos),
                }

            # Tier 3: Fallback API with retry
            logger.info(f"HTML scrape failed for {username}, trying fallback API")
            result = self._scrape_fallback_with_retry(github_url, retries=2)
            if result and result.get("repositories"):
                result["email"] = github_email
                return result

            logger.warning(f"All GitHub scraping methods failed for {username}")
            resp = self._empty_response()
            resp["email"] = github_email
            return resp

        except Exception as e:
            logger.error(f"Error analyzing GitHub profile {github_url}: {str(e)}")
            return self._empty_response()

    def _extract_user_email(self, username: str) -> Optional[str]:
        """Extract public email from GitHub user profile API."""
        try:
            api_url = f"https://api.github.com/users/{username}"
            headers = {"User-Agent": "TalentLens-HR-Assistant"}
            response = requests.get(api_url, headers=headers, timeout=self.timeout)
            if response.status_code == 200:
                data = response.json()
                email = data.get("email")
                if email:
                    logger.info(f"Extracted email {email} from GitHub profile for {username}")
                    return email
        except Exception as e:
            logger.warning(f"Could not extract email from GitHub for {username}: {e}")
        return None

    def _scrape_repos_api(self, username: str, max_repos: int = 10) -> List[Dict[str, Any]]:
        """
        Fetch repositories from GitHub REST API.
        
        Args:
            username: GitHub username
            max_repos: Maximum number of repos to fetch
            
        Returns:
            List of repository data
        """
        try:
            api_url = f"https://api.github.com/users/{username}/repos?sort=updated&per_page={max_repos}"
            headers = {"User-Agent": "TalentLens-HR-Assistant"}
            response = requests.get(api_url, headers=headers, timeout=self.timeout)
            
            if response.status_code == 200:
                repos_data = response.json()
                repos = []
                for repo in repos_data[:max_repos]:
                    if isinstance(repo, dict):
                        repos.append({
                            "name": repo.get("name", "unknown"),
                            "url": repo.get("html_url", f"https://github.com/{username}/{repo.get('name')}"),
                            "description": repo.get("description"),
                            "language": repo.get("language"),
                            "stars": repo.get("stargazers_count", 0),
                            "forks": repo.get("forks_count", 0),
                            "readme_quality_score": 75.0,  # Default reasonable score
                            "commit_frequency": "active" if not repo.get("archived") else "archived",
                        })
                return repos
            
            # If rate limited (403) or not found (404), return empty to allow fallback
            logger.warning(f"GitHub API returned status {response.status_code} for {username}")
            return []

        except requests.exceptions.Timeout:
            logger.warning(f"GitHub API timeout for {username}")
            return []
        except requests.exceptions.ConnectionError:
            logger.warning(f"GitHub API connection error for {username}")
            return []
        except Exception as e:
            logger.error(f"Error fetching GitHub profile via API for {username}: {str(e)}")
            return []

    def _scrape_repos_html(self, username: str, max_repos: int = 10) -> List[Dict[str, Any]]:
        """
        Scrape repositories from a GitHub profile page via HTML.
        This is a fallback when the API is rate-limited.

        Args:
            username: GitHub username
            max_repos: Maximum repos to return

        Returns:
            List of repository data
        """
        try:
            profile_url = f"https://github.com/{username}?tab=repositories"
            headers = {"User-Agent": "Mozilla/5.0 (compatible; TalentLens)"}
            response = requests.get(profile_url, headers=headers, timeout=self.timeout)

            if response.status_code != 200:
                return []

            soup = BeautifulSoup(response.content, "html.parser")
            repo_elements = soup.find_all("li", {"itemprop": "owns"})

            repos: list[dict[str, Any]] = []
            for elem in repo_elements[:max_repos]:
                try:
                    name_tag = elem.find("a", {"itemprop": "name codeRepository"})
                    if not name_tag:
                        continue
                    name = name_tag.get_text(strip=True)
                    url = f"https://github.com{name_tag.get('href', '')}"

                    desc_tag = elem.find("p", {"itemprop": "description"})
                    description = desc_tag.get_text(strip=True) if desc_tag else None

                    lang_tag = elem.find("span", {"itemprop": "programmingLanguage"})
                    language = lang_tag.get_text(strip=True) if lang_tag else None

                    # Stars from the page
                    star_tag = elem.find("a", href=re.compile(r"/stargazers"))
                    stars = 0
                    if star_tag:
                        star_text = star_tag.get_text(strip=True).replace(",", "")
                        stars = int(re.sub(r"\D", "", star_text) or 0)

                    fork_tag = elem.find("a", href=re.compile(r"/forks"))
                    forks = 0
                    if fork_tag:
                        fork_text = fork_tag.get_text(strip=True).replace(",", "")
                        forks = int(re.sub(r"\D", "", fork_text) or 0)

                    repos.append({
                        "name": name,
                        "url": url,
                        "description": description,
                        "language": language,
                        "stars": stars,
                        "forks": forks,
                        "readme_quality_score": 50.0,  # Conservative estimate for HTML scrape
                        "commit_frequency": "unknown",
                    })
                except Exception:
                    continue

            return repos

        except requests.exceptions.Timeout:
            logger.warning(f"HTML scrape timeout for {username}")
            return []
        except Exception as e:
            logger.warning(f"HTML scrape failed for {username}: {e}")
            return []

    def _scrape_repo_details(self, repo_url: str) -> Optional[Dict[str, Any]]:
        """
        Scrape individual repository details.
        
        Args:
            repo_url: Repository URL
            
        Returns:
            Dictionary with repository data
        """
        try:
            response = requests.get(repo_url, timeout=self.timeout)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, "html.parser")
            
            # Extract basic info
            name = repo_url.split("/")[-1]
            description = self._extract_description(soup)
            language = self._extract_language(soup)
            
            # Extract stars and forks
            stars = self._extract_count(soup, "stargazers")
            forks = self._extract_count(soup, "network/members")
            
            # Score README quality
            readme_quality = self._score_readme(soup)
            
            # Estimate commit frequency
            commit_frequency = self._estimate_commit_frequency(soup)
            
            return {
                "name": name,
                "url": repo_url,
                "description": description,
                "language": language,
                "stars": stars,
                "forks": forks,
                "readme_quality_score": readme_quality,
                "commit_frequency": commit_frequency,
            }

        except Exception as e:
            logger.warning(f"Error scraping repo details for {repo_url}: {str(e)}")
            return None

    def _score_readme(self, soup: BeautifulSoup) -> float:
        """
        Score README quality (0-100) based on multiple factors.
        
        Args:
            soup: BeautifulSoup object of repository page
            
        Returns:
            README quality score (0-100)
        """
        score = 0.0
        
        try:
            # Look for README content
            readme = soup.find("article", {"class": "markdown-body"})
            if not readme:
                return score

            content = readme.get_text()
            
            # Length check (30 points)
            if len(content) > 1000:
                score += 30
            elif len(content) > 500:
                score += 20
            elif len(content) > 100:
                score += 10

            # Structure check (20 points)
            headers = soup.find_all(re.compile("^h[1-6]$"))
            if len(headers) > 3:
                score += 20
            elif len(headers) > 1:
                score += 10

            # Code examples (20 points)
            code_blocks = soup.find_all("pre")
            if len(code_blocks) > 2:
                score += 20
            elif len(code_blocks) > 0:
                score += 10

            # Badges (15 points)
            if "badge" in content.lower() or soup.find("img", {"alt": re.compile(".*badge.*")}):
                score += 15

            # Links and references (15 points)
            links = readme.find_all("a")
            if len(links) > 3:
                score += 15
            elif len(links) > 0:
                score += 7

        except Exception as e:
            logger.warning(f"Error scoring README: {str(e)}")

        return min(score, 100.0)

    def _extract_description(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract repository description."""
        try:
            desc_elem = soup.find("p", {"class": "f4 text-normal"})
            if desc_elem:
                return desc_elem.get_text(strip=True)
        except Exception:
            pass
        return None

    def _extract_language(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract primary programming language."""
        try:
            lang_elem = soup.find("span", {"itemprop": "programmingLanguage"})
            if lang_elem:
                return lang_elem.get_text(strip=True)
        except Exception:
            pass
        return None

    def _extract_count(self, soup: BeautifulSoup, pattern: str) -> int:
        """Extract count from GitHub UI."""
        try:
            links = soup.find_all("a")
            for link in links:
                if pattern in link.get("href", ""):
                    count_text = link.get_text(strip=True).split()[0]
                    return int(re.sub(r"\D", "", count_text)) or 0
        except Exception:
            pass
        return 0

    def _estimate_commit_frequency(self, soup: BeautifulSoup) -> str:
        """Estimate commit frequency from available data."""
        try:
            # Look for commit history indicators
            # This is simplified - in production you'd use GitHub API
            return "unknown"
        except Exception:
            return "unknown"

    def _scrape_fallback_with_retry(
        self,
        github_url: str,
        retries: int = 2,
        backoff: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Try GitHub Repo Analyzer API as fallback with retry logic.

        Args:
            github_url: GitHub URL
            retries: Number of retry attempts
            backoff: Base delay in seconds between retries

        Returns:
            Data from fallback API or empty response
        """
        username = self._extract_username(github_url)
        if not username:
            return self._empty_response()

        for attempt in range(retries + 1):
            try:
                fallback_url = f"{self.fallback_api}api/v1/user/{username}"
                response = requests.get(fallback_url, timeout=self.timeout)

                if response.status_code == 200:
                    data = response.json()
                    repos = data.get("repositories", [])
                    if repos:
                        logger.info(f"Fallback API succeeded for {username} on attempt {attempt + 1}")
                        return {
                            "username": username,
                            "github_url": github_url,
                            "repositories": repos,
                            "source": "fallback_api",
                            "profile_quality_score": self._score_profile(repos),
                        }

                logger.warning(f"Fallback API returned status {response.status_code} for {username} (attempt {attempt + 1})")

            except requests.exceptions.Timeout:
                logger.warning(f"Fallback API timeout for {username} (attempt {attempt + 1})")
            except requests.exceptions.ConnectionError:
                logger.warning(f"Fallback API connection error for {username} (attempt {attempt + 1})")
            except Exception as e:
                logger.warning(f"Fallback API error for {username}: {e} (attempt {attempt + 1})")

            if attempt < retries:
                time.sleep(backoff * (attempt + 1))

        return self._empty_response()

    def _score_profile(self, repos: List[Dict[str, Any]]) -> float:
        """
        Score overall GitHub profile quality.
        
        Args:
            repos: List of repository data
            
        Returns:
            Profile quality score (0-100)
        """
        if not repos:
            return 0.0

        score = 0.0
        
        # Repo count (max 20 points)
        repo_count = len(repos)
        score += min(repo_count * 2, 20)
        
        # Average stars (max 30 points)
        avg_stars = sum(r.get("stars", 0) for r in repos) / repo_count if repo_count > 0 else 0
        score += min(avg_stars / 10, 30)
        
        # README quality (max 30 points)
        avg_readme = sum(r.get("readme_quality_score", 0) for r in repos) / repo_count if repo_count > 0 else 0
        score += avg_readme * 0.3
        
        # Language diversity (max 20 points)
        languages = set(r.get("language") for r in repos if r.get("language"))
        score += min(len(languages) * 5, 20)
        
        return min(score, 100.0)

    def _is_valid_github_url(self, url: str) -> bool:
        """Check if URL is a valid GitHub URL."""
        if not url:
            return False
        return "github.com/" in url.lower()

    def _extract_username(self, github_url: str) -> Optional[str]:
        """Extract GitHub username from URL."""
        if not github_url:
            return None
        match = re.search(r"github\.com/([A-Za-z0-9_.-]+)", github_url, re.IGNORECASE)
        if match:
            username = match.group(1)
            # Filter out common reserved paths
            if username.lower() in {"settings", "features", "about", "explore", "trending", "pricing", "topics"}:
                return None
            return username
        return None

    def _empty_response(self) -> Dict[str, Any]:
        """Return empty response structure."""
        return {
            "username": None,
            "repositories": [],
            "source": None,
            "profile_quality_score": 0.0,
        }
