"""PDF validation, GitHub API failure/rate-limit handling, 24h workflow tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from app.connectors.github import GitHubConnector
from app.models.enums import SyncStatus
from app.services import pdf as pdfsvc

# ---- PDF validation -------------------------------------------------------

def test_pdf_rejects_non_pdf_extension():
    with pytest.raises(pdfsvc.PdfValidationError):
        pdfsvc.validate_pdf("deck.exe", b"%PDF-1.4 ...", "application/pdf")


def test_pdf_rejects_bad_header():
    with pytest.raises(pdfsvc.PdfValidationError):
        pdfsvc.validate_pdf("deck.pdf", b"not a pdf", "application/pdf")


def test_pdf_rejects_empty():
    with pytest.raises(pdfsvc.PdfValidationError):
        pdfsvc.validate_pdf("deck.pdf", b"", "application/pdf")


def test_pdf_accepts_valid_header():
    pdfsvc.validate_pdf("deck.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")  # no raise


def test_filename_sanitization_blocks_traversal():
    assert pdfsvc.sanitize_filename("../../etc/passwd") == "passwd"
    assert "/" not in pdfsvc.sanitize_filename("a/b/c.pdf")
    assert pdfsvc.sanitize_filename("weird name!@#.pdf") == "weird_name___.pdf"


# ---- GitHub failure handling (mocked transport, no network) ---------------

def _connector_with(handler) -> GitHubConnector:
    gh = GitHubConnector(token="")
    # monkeypatch _get to use a mock transport
    transport = httpx.MockTransport(handler)

    async def _get(client, path, retries=3):  # noqa: ARG001
        async with httpx.AsyncClient(transport=transport) as c:
            resp = await c.get(f"https://api.github.com{path}")
            data = resp.json() if resp.content else None
            return resp.status_code, data, resp.headers

    gh._get = _get  # type: ignore
    return gh


@pytest.mark.asyncio
async def test_github_user_not_found():
    def handler(request):
        return httpx.Response(404, json={"message": "Not Found"})

    gh = _connector_with(handler)
    result = await gh.fetch_user("nope")
    assert result.status == SyncStatus.NOT_FOUND
    assert result.evidence == []


@pytest.mark.asyncio
async def test_github_rate_limited():
    def handler(request):
        return httpx.Response(
            403, headers={"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1700000000"},
            json={"message": "rate limit"},
        )

    gh = _connector_with(handler)
    result = await gh.fetch_user("someone")
    assert result.status == SyncStatus.RATE_LIMITED
    assert result.rate_limit_remaining == 0


@pytest.mark.asyncio
async def test_github_success_normalizes_evidence():
    def handler(request):
        if request.url.path == "/users/octodemo":
            return httpx.Response(200, json={
                "login": "octodemo", "name": "Octo Demo", "bio": "builder",
                "html_url": "https://github.com/octodemo", "public_repos": 2,
                "followers": 10, "created_at": "2020-01-01T00:00:00Z",
            })
        if request.url.path == "/users/octodemo/repos":
            return httpx.Response(200, json=[{
                "name": "engine", "full_name": "octodemo/engine", "fork": False,
                "html_url": "https://github.com/octodemo/engine", "description": "core",
                "language": "Python", "stargazers_count": 5, "forks_count": 1,
                "open_issues_count": 0, "created_at": "2021-01-01T00:00:00Z",
                "pushed_at": "2024-01-01T00:00:00Z",
            }])
        return httpx.Response(200, json=[])

    gh = _connector_with(handler)
    result = await gh.fetch_user("octodemo")
    assert result.status in (SyncStatus.SUCCESS, SyncStatus.PARTIAL)
    kinds = {e.kind for e in result.evidence}
    assert "github_profile" in kinds
    assert "github_repo" in kinds
    # stars captured but explicitly labeled as not commercial traction
    repo_ev = next(e for e in result.evidence if e.kind == "github_repo")
    assert "not commercial traction" in repo_ev.structured_value["stars_note"].lower()


# ---- 24h workflow timer ---------------------------------------------------

def test_workflow_timer_math():
    from app.services.workflow import TARGET, _human

    now = datetime.now(UTC)
    delta = now - (now - timedelta(hours=2))
    assert _human(delta).startswith("2h")
    # target is 24h
    assert TARGET == timedelta(hours=24)
