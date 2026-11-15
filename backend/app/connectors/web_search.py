"""Live web search connector (Tavily) for finding company sites, launch posts,
and changelogs outside GitHub.

Runs on the backend only; the API key is read from the environment and never
returned to the client. Every failure maps to an explicit status so the UI can
say what happened (missing key, rate limit, plan limit, provider error) instead
of showing an empty list as if nothing matched.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

from app.core.config import settings

TAVILY_SEARCH_URL = "https://api.tavily.com/search"

# Social networks, code hosts, and aggregators: either covered by another
# connector (GitHub), restricted, or not a primary source about the company.
EXCLUDED_DOMAINS = [
    "github.com", "linkedin.com", "x.com", "twitter.com", "facebook.com", "instagram.com",
    "youtube.com", "tiktok.com", "reddit.com", "wikipedia.org", "crunchbase.com", "pitchbook.com",
    # directories and listicles: never a company site or a launch page
    "f6s.com", "failory.com", "tracxn.com", "cbinsights.com", "wellfound.com", "angel.co",
    "fundedstartupsdaily.com", "seedtable.com", "getlaunchlist.com", "g2.com", "capterra.com",
    "alternativeto.net", "saashub.com", "theresanaiforthat.com", "futurepedia.io",
]

# One targeted search per launch site; plain category keywords work best when
# each runs against a single site. Which of their pages count as launch pages
# is decided in services.web_sourcing.
def launch_queries(keywords: str) -> list[tuple[str, list[str]]]:
    return [
        (f"YC startup launches {keywords}", ["ycombinator.com"]),
        (f"Show HN {keywords}", ["news.ycombinator.com"]),
        (f"{keywords} launch", ["producthunt.com"]),
    ]

# How much page text each source contributes. The same truncated text is what
# the model sees and what quoted claims are checked against.
MAX_SOURCE_CHARS = 2400


class WebSearchError(Exception):
    """A search could not run. `code` is stable for the UI."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class WebSource:
    """One retrieved page. `id` (S1, S2, ...) is how the model cites it."""

    id: str
    url: str
    title: str
    text: str
    published_date: str | None
    domain: str
    query: str
    score: float = 0.0

    def as_dict(self) -> dict:
        return {
            "id": self.id, "url": self.url, "title": self.title, "domain": self.domain,
            "published_date": self.published_date, "query": self.query,
        }


@dataclass
class WebSearchRun:
    sources: list[WebSource] = field(default_factory=list)
    queries_run: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def domain_of(url: str | None) -> str | None:
    """Registrable-ish host: lowercased, without `www.`."""
    if not url:
        return None
    if "://" not in url:
        url = "https://" + url
    host = (urlsplit(url).hostname or "").lower().strip(".")
    if host.startswith("www."):
        host = host[4:]
    return host or None


_TRACKING_PARAMS = re.compile(r"^(utm_\w+|ref|ref_src|fbclid|gclid|mc_\w+|source)$", re.I)


def canonical_url(url: str) -> str:
    """Stable URL for dedup: https, no www, no fragment, no trailing slash,
    tracking parameters removed. Meaningful query parameters are kept (a Hacker
    News item is identified by `?id=`)."""
    parts = urlsplit(url.strip())
    host = (parts.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = parts.path.rstrip("/") or ""
    if host == "ycombinator.com" and path.startswith("/launches/"):
        # /launches/Qey-zenbu and /launches/Qey-zenbu-the-extensible-ide are one page
        path = "/launches/" + path.split("/")[2].split("-")[0]
    query = urlencode(sorted((k, v) for k, v in parse_qsl(parts.query) if not _TRACKING_PARAMS.match(k)))
    return urlunsplit(("https", host, path, query, ""))


class TavilySearch:
    name = "tavily"

    def __init__(self, api_key: str | None = None, timeout: float | None = None):
        self.api_key = (api_key if api_key is not None else settings.tavily_api_key).strip()
        self.timeout = timeout or settings.http_timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    async def _search_one(
        self, client: httpx.AsyncClient, query: str, max_results: int, include_domains: list[str] | None = None
    ) -> list[dict]:
        body: dict = {
            "query": query,
            "search_depth": "basic",
            "max_results": max_results,
            "include_raw_content": "text",
            "include_published_date": True,
            "exclude_domains": EXCLUDED_DOMAINS,
            "time_range": "year",
        }
        if include_domains:
            body["include_domains"] = include_domains
        last: Exception | None = None
        for attempt in range(2):
            try:
                resp = await client.post(
                    TAVILY_SEARCH_URL, json=body,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
            except httpx.TransportError as exc:
                last = exc
                await asyncio.sleep(0.6 * (attempt + 1))
                continue
            if resp.status_code == 200:
                return list((resp.json() or {}).get("results") or [])
            if resp.status_code == 401:
                raise WebSearchError("invalid_credentials", "The web search provider rejected TAVILY_API_KEY.")
            if resp.status_code == 429:
                raise WebSearchError("rate_limited", "Web search rate limit reached. Try again in a minute.")
            if resp.status_code in (432, 433):
                raise WebSearchError("plan_limit", "The web search plan's credit limit has been reached.")
            if resp.status_code >= 500:
                last = WebSearchError("provider_error", f"Web search provider error ({resp.status_code}).")
                await asyncio.sleep(0.6 * (attempt + 1))
                continue
            raise WebSearchError("provider_error", f"Web search request was rejected ({resp.status_code}).")
        if isinstance(last, WebSearchError):
            raise last
        raise WebSearchError("provider_unreachable", "Could not reach the web search provider.")

    async def search(
        self, queries: list[str], *, targeted: list[tuple[str, list[str]]] | None = None,
        per_query: int = 6, max_sources: int = 16,
    ) -> WebSearchRun:
        """Run open-web `queries` and `targeted` (query, include_domains) pairs,
        then merge round-robin by rank so every query contributes sources.
        Duplicate URLs (canonical) are kept once.

        Raises WebSearchError only when no query succeeded; partial failures
        become notes on the run.
        """
        if not self.configured:
            raise WebSearchError(
                "not_configured", "Web search is not configured. Set TAVILY_API_KEY on the backend."
            )
        run = WebSearchRun()
        per: list[tuple[str, list[dict]]] = []
        failures: list[WebSearchError] = []
        planned: list[tuple[str, list[str] | None]] = [(q, None) for q in queries]
        planned += [(q, list(d)) for q, d in targeted or []]
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for q, include in planned:
                try:
                    items = await self._search_one(client, q, per_query, include)
                except WebSearchError as exc:
                    failures.append(exc)
                    if exc.code in ("invalid_credentials", "plan_limit"):
                        break
                    continue
                run.queries_run.append(q)
                ok = [it for it in items if it.get("url") and domain_of(it["url"])]
                per.append((q, sorted(ok, key=lambda it: -(it.get("score") or 0))))
        if not run.queries_run and failures:
            raise failures[0]
        if failures:
            run.notes.append(f"{len(failures)} of {len(planned)} searches failed: {failures[0].message}")

        picked: list[tuple[dict, str]] = []
        seen: set[str] = set()
        for rank in range(per_query):
            for q, items in per:
                if rank < len(items) and len(picked) < max_sources:
                    key = canonical_url(items[rank]["url"])
                    if key not in seen:
                        seen.add(key)
                        picked.append((items[rank], q))
        for i, (it, q) in enumerate(picked, start=1):
            content = (it.get("content") or "").strip()
            raw = (it.get("raw_content") or "").strip()
            text = content if not raw else f"{content}\n\n{raw}"
            run.sources.append(WebSource(
                id=f"S{i}", url=it["url"], title=(it.get("title") or "").strip(),
                text=" ".join(text.split())[:MAX_SOURCE_CHARS],
                published_date=it.get("published_date") or None,
                domain=domain_of(it["url"]) or "", query=q, score=float(it.get("score") or 0),
            ))
        return run
