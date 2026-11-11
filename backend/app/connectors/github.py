"""Real, live GitHub public-data connector (official REST API v3).

Collects only public information. Uses GITHUB_TOKEN when available (5000 req/hr)
and otherwise the anonymous public API (60 req/hr). Handles:
- missing profiles (404) -> NOT_FOUND
- rate limiting (403 + X-RateLimit-Remaining: 0) -> RATE_LIMITED
- transient failures -> retries with backoff
- incomplete responses -> partial results
- deleted repos -> skipped

Never scrapes restricted platforms. GitHub stars are captured but explicitly
labeled as external interest, NOT commercial traction.
"""

from __future__ import annotations

import asyncio
import hashlib
from datetime import UTC, datetime
from urllib.parse import quote

import httpx

from app.connectors.base import Connector, ConnectorResult, NormalizedEvidence
from app.core.config import settings
from app.models.enums import Provenance, SourceType, SyncStatus, VerificationStatus

GITHUB_API = "https://api.github.com"


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _dedup(*parts: object) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:32]


class GitHubConnector(Connector):
    name = "github"
    is_live = True

    def __init__(self, token: str | None = None, timeout: float | None = None):
        self.token = token if token is not None else settings.github_token
        self.timeout = timeout or settings.http_timeout_seconds

    def _headers(self) -> dict[str, str]:
        h = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Trajectory-VC-Platform",
        }
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    async def _get(
        self, client: httpx.AsyncClient, path: str, retries: int = 3
    ) -> tuple[int, object, httpx.Headers]:
        """GET with retry/backoff. Returns (status_code, json_or_none, headers)."""
        last_exc: Exception | None = None
        for attempt in range(retries):
            try:
                resp = await client.get(f"{GITHUB_API}{path}", headers=self._headers())
                # rate limited
                if resp.status_code == 403 and resp.headers.get("X-RateLimit-Remaining") == "0":
                    return resp.status_code, None, resp.headers
                if resp.status_code >= 500:
                    raise httpx.HTTPStatusError("server error", request=resp.request, response=resp)
                data = resp.json() if resp.content else None
                return resp.status_code, data, resp.headers
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                last_exc = exc
                await asyncio.sleep(0.5 * (2**attempt))
        if last_exc:
            raise last_exc
        return 0, None, httpx.Headers()

    @staticmethod
    def _rate_from_headers(headers: httpx.Headers) -> tuple[int | None, datetime | None]:
        rem = headers.get("X-RateLimit-Remaining")
        reset = headers.get("X-RateLimit-Reset")
        remaining = int(rem) if rem is not None else None
        reset_at = (
            datetime.fromtimestamp(int(reset), tz=UTC) if reset else None
        )
        return remaining, reset_at

    async def health(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                status, data, headers = await self._get(client, "/rate_limit")
            remaining, reset_at = self._rate_from_headers(headers)
            core = (data or {}).get("resources", {}).get("core", {}) if isinstance(data, dict) else {}
            return {
                "connector": "github",
                "live": True,
                "authenticated": bool(self.token),
                "status": "ok" if status == 200 else "degraded",
                "rate_limit_remaining": core.get("remaining", remaining),
                "rate_limit_limit": core.get("limit"),
            }
        except Exception as exc:  # noqa: BLE001 - health must never raise
            return {
                "connector": "github",
                "live": True,
                "authenticated": bool(self.token),
                "status": "error",
                "message": str(exc)[:200],
            }

    async def fetch_user(
        self, username: str, max_repos: int = 20, include_releases: bool = True
    ) -> ConnectorResult:
        """Fetch a public user profile + top repos and normalize into evidence.

        include_releases=False skips per-repo release lookups — used by batch
        discovery to stay fast and light on the API.
        """
        username = username.strip().lstrip("@")
        evidence: list[NormalizedEvidence] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                status, user, headers = await self._get(client, f"/users/{username}")
                remaining, reset_at = self._rate_from_headers(headers)

                if status == 403 and remaining == 0:
                    return ConnectorResult(
                        status=SyncStatus.RATE_LIMITED, connector="github",
                        target=username,
                        message="GitHub rate limit exhausted. Add GITHUB_TOKEN to raise the limit.",
                        rate_limit_remaining=remaining, rate_limit_reset_at=reset_at,
                    )
                if status == 404 or not isinstance(user, dict):
                    return ConnectorResult(
                        status=SyncStatus.NOT_FOUND, connector="github", target=username,
                        message=f"GitHub user '{username}' not found.",
                        rate_limit_remaining=remaining, rate_limit_reset_at=reset_at,
                    )

                profile = {
                    "login": user.get("login"),
                    "name": user.get("name"),
                    "bio": user.get("bio"),
                    "location": user.get("location"),
                    "company": user.get("company"),
                    "blog": user.get("blog"),
                    "public_repos": user.get("public_repos"),
                    "followers": user.get("followers"),
                    "html_url": user.get("html_url"),
                    "created_at": user.get("created_at"),
                }

                # profile evidence
                evidence.append(
                    NormalizedEvidence(
                        source_name=f"GitHub @{username}",
                        source_type=SourceType.GITHUB_PROFILE,
                        source_url=user.get("html_url"),
                        kind="github_profile",
                        title=f"GitHub profile @{username}",
                        raw_value=(user.get("bio") or "")[:500],
                        structured_value={
                            "followers": user.get("followers"),
                            "public_repos": user.get("public_repos"),
                            "account_created": user.get("created_at"),
                            "note": "followers = external interest, not commercial traction",
                        },
                        event_date=_parse_dt(user.get("created_at")),
                        provenance=Provenance.INDEPENDENT,
                        verification_status=VerificationStatus.VERIFIED,
                        confidence=0.9,
                        dedup_key=_dedup("gh_profile", username),
                    )
                )

                # repositories
                status_r, repos, headers_r = await self._get(
                    client, f"/users/{username}/repos?per_page={max_repos}&sort=updated"
                )
                remaining, reset_at = self._rate_from_headers(headers_r)
                partial = False
                if isinstance(repos, list):
                    for repo in repos:
                        if not isinstance(repo, dict) or repo.get("fork"):
                            continue
                        evidence.extend(self._repo_evidence(repo, username))
                        if not include_releases:
                            continue
                        # releases (best-effort; ignore failures -> partial)
                        try:
                            rel_status, releases, _ = await self._get(
                                client,
                                f"/repos/{repo.get('full_name')}/releases?per_page=5",
                                retries=2,
                            )
                            if isinstance(releases, list) and releases:
                                evidence.append(self._release_evidence(repo, releases))
                        except Exception:  # noqa: BLE001
                            partial = True
                else:
                    partial = True

            status_enum = SyncStatus.PARTIAL if partial else SyncStatus.SUCCESS
            return ConnectorResult(
                status=status_enum, connector="github", target=username,
                evidence=evidence, profile=profile,
                message=f"Collected {len(evidence)} evidence items from @{username}.",
                rate_limit_remaining=remaining, rate_limit_reset_at=reset_at,
            )
        except Exception as exc:  # noqa: BLE001
            return ConnectorResult(
                status=SyncStatus.ERROR, connector="github", target=username,
                evidence=evidence, message=f"GitHub sync failed: {str(exc)[:200]}",
            )

    async def search_logins(
        self, query: str, kind: str = "repositories", per_page: int = 15
    ) -> tuple[str, list[str], int | None]:
        """Search public GitHub for candidate builder-founders.

        kind='repositories' -> returns the LOGINS of the owners of matching repos
        (the builders behind relevant public projects). kind='users' -> matching
        user logins. Returns (status, logins, rate_limit_remaining).

        The Search API has its own rate limit (~30/min authenticated); a 403 with
        remaining 0 returns status='rate_limited' so callers can stop.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                status, data, headers = await self._get(
                    client, f"/search/{kind}?q={quote(query)}&per_page={per_page}&sort=updated"
                )
                remaining, _ = self._rate_from_headers(headers)
                if status == 403 and remaining == 0:
                    return "rate_limited", [], remaining
                if status != 200 or not isinstance(data, dict):
                    return "error", [], remaining
                items = data.get("items", []) or []
                logins: list[str] = []
                for it in items:
                    if not isinstance(it, dict):
                        continue
                    if kind == "users":
                        login = it.get("login")
                    else:
                        owner = it.get("owner") or {}
                        # skip organizations — we want individual builders
                        if owner.get("type") == "Organization":
                            continue
                        login = owner.get("login")
                    if login:
                        logins.append(login)
                return "ok", logins, remaining
        except Exception as exc:  # noqa: BLE001
            return f"error:{str(exc)[:80]}", [], None

    async def fetch_org(self, org: str, max_repos: int = 20) -> ConnectorResult:
        org = org.strip().lstrip("@")
        evidence: list[NormalizedEvidence] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                status, data, headers = await self._get(client, f"/orgs/{org}")
                remaining, reset_at = self._rate_from_headers(headers)
                if status == 403 and remaining == 0:
                    return ConnectorResult(
                        status=SyncStatus.RATE_LIMITED, connector="github", target=org,
                        message="GitHub rate limit exhausted.",
                        rate_limit_remaining=remaining, rate_limit_reset_at=reset_at,
                    )
                if status == 404 or not isinstance(data, dict):
                    return ConnectorResult(
                        status=SyncStatus.NOT_FOUND, connector="github", target=org,
                        message=f"GitHub org '{org}' not found.",
                    )
                status_r, repos, headers_r = await self._get(
                    client, f"/orgs/{org}/repos?per_page={max_repos}&sort=updated"
                )
                remaining, reset_at = self._rate_from_headers(headers_r)
                if isinstance(repos, list):
                    for repo in repos:
                        if isinstance(repo, dict) and not repo.get("fork"):
                            evidence.extend(self._repo_evidence(repo, org, is_org=True))
            return ConnectorResult(
                status=SyncStatus.SUCCESS, connector="github", target=org,
                evidence=evidence, profile={"login": org, "html_url": data.get("html_url")},
                message=f"Collected {len(evidence)} evidence items from org {org}.",
                rate_limit_remaining=remaining, rate_limit_reset_at=reset_at,
            )
        except Exception as exc:  # noqa: BLE001
            return ConnectorResult(
                status=SyncStatus.ERROR, connector="github", target=org,
                message=f"GitHub org sync failed: {str(exc)[:200]}",
            )

    async def fetch_repo(self, owner: str, repo: str) -> ConnectorResult:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                status, data, headers = await self._get(client, f"/repos/{owner}/{repo}")
                remaining, reset_at = self._rate_from_headers(headers)
                if status == 404 or not isinstance(data, dict):
                    return ConnectorResult(
                        status=SyncStatus.NOT_FOUND, connector="github",
                        target=f"{owner}/{repo}", message="Repository not found.",
                    )
                evidence = self._repo_evidence(data, owner)
                # contributors -> collaboration / outside contributors
                _, contributors, _ = await self._get(
                    client, f"/repos/{owner}/{repo}/contributors?per_page=20"
                )
                if isinstance(contributors, list) and len(contributors) > 1:
                    outside = max(0, len(contributors) - 1)
                    evidence.append(
                        NormalizedEvidence(
                            source_name=f"GitHub {owner}/{repo}",
                            source_type=SourceType.GITHUB_REPO,
                            source_url=data.get("html_url"),
                            kind="github_outside_contributor",
                            title=f"{outside} outside contributors on {repo}",
                            raw_value=f"{len(contributors)} total contributors",
                            structured_value={"outside_contributors": outside},
                            event_date=_parse_dt(data.get("pushed_at")),
                            provenance=Provenance.INDEPENDENT,
                            verification_status=VerificationStatus.VERIFIED,
                            confidence=0.85,
                            dedup_key=_dedup("gh_contrib", owner, repo),
                        )
                    )
            return ConnectorResult(
                status=SyncStatus.SUCCESS, connector="github",
                target=f"{owner}/{repo}", evidence=evidence,
                message=f"Collected {len(evidence)} evidence items from {owner}/{repo}.",
                rate_limit_remaining=remaining, rate_limit_reset_at=reset_at,
            )
        except Exception as exc:  # noqa: BLE001
            return ConnectorResult(
                status=SyncStatus.ERROR, connector="github",
                target=f"{owner}/{repo}", message=f"GitHub repo sync failed: {str(exc)[:200]}",
            )

    def _repo_evidence(
        self, repo: dict, owner: str, is_org: bool = False
    ) -> list[NormalizedEvidence]:
        items: list[NormalizedEvidence] = []
        name = repo.get("name", "")
        full = repo.get("full_name", f"{owner}/{name}")
        url = repo.get("html_url")
        pushed = _parse_dt(repo.get("pushed_at"))
        created = _parse_dt(repo.get("created_at"))

        items.append(
            NormalizedEvidence(
                source_name=f"GitHub {full}",
                source_type=SourceType.GITHUB_REPO,
                source_url=url,
                kind="github_repo",
                title=f"Public repository: {name}",
                raw_value=(repo.get("description") or "")[:500],
                structured_value={
                    "stars": repo.get("stargazers_count"),
                    "forks": repo.get("forks_count"),
                    "open_issues": repo.get("open_issues_count"),
                    "language": repo.get("language"),
                    "topics": repo.get("topics") or [],
                    "created_at": repo.get("created_at"),
                    "pushed_at": repo.get("pushed_at"),
                    "stars_note": "external interest only, NOT commercial traction",
                },
                event_date=created,
                provenance=Provenance.INDEPENDENT,
                verification_status=VerificationStatus.VERIFIED,
                confidence=0.85,
                dedup_key=_dedup("gh_repo", full),
            )
        )
        # recent maintenance signal
        if pushed:
            items.append(
                NormalizedEvidence(
                    source_name=f"GitHub {full}",
                    source_type=SourceType.GITHUB_REPO,
                    source_url=url,
                    kind="github_repo_maintenance",
                    title=f"{name} last updated {repo.get('pushed_at')}",
                    raw_value=repo.get("pushed_at") or "",
                    structured_value={"pushed_at": repo.get("pushed_at")},
                    event_date=pushed,
                    provenance=Provenance.INDEPENDENT,
                    verification_status=VerificationStatus.VERIFIED,
                    confidence=0.8,
                    dedup_key=_dedup("gh_maint", full, repo.get("pushed_at")),
                )
            )
        if repo.get("language"):
            items.append(
                NormalizedEvidence(
                    source_name=f"GitHub {full}",
                    source_type=SourceType.GITHUB_REPO,
                    source_url=url,
                    kind="github_language",
                    title=f"Primary language: {repo.get('language')}",
                    raw_value=str(repo.get("language") or ""),
                    structured_value={"language": repo.get("language")},
                    event_date=created,
                    provenance=Provenance.INDEPENDENT,
                    verification_status=VerificationStatus.VERIFIED,
                    confidence=0.75,
                    dedup_key=_dedup("gh_lang", full, repo.get("language")),
                )
            )
        return items

    def _release_evidence(self, repo: dict, releases: list) -> NormalizedEvidence:
        full = repo.get("full_name")
        latest = releases[0] if releases else {}
        return NormalizedEvidence(
            source_name=f"GitHub {full}",
            source_type=SourceType.GITHUB_REPO,
            source_url=latest.get("html_url") or repo.get("html_url"),
            kind="github_release",
            title=f"{len(releases)} public release(s) on {repo.get('name')}",
            raw_value=str(latest.get("tag_name", "")),
            structured_value={
                "release_count": len(releases),
                "latest_tag": latest.get("tag_name"),
                "latest_published": latest.get("published_at"),
            },
            event_date=_parse_dt(latest.get("published_at")),
            provenance=Provenance.INDEPENDENT,
            verification_status=VerificationStatus.VERIFIED,
            confidence=0.85,
            dedup_key=_dedup("gh_release", full, latest.get("tag_name")),
        )
