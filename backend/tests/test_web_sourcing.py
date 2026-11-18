"""Web sourcing: validation against retrieved sources, save/dedup, new evidence.

Every test uses fixtures: the web search provider, the AI structurer, and the
GitHub account lookup are replaced, so nothing here touches the network.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from app.ai import services as ai_services
from app.connectors.web_search import WebSearchError, WebSearchRun, WebSource
from app.services.web_sourcing import validate_web_results

NOW = datetime(2026, 11, 13, tzinfo=UTC)


def src(i: int, url: str, title: str, text: str, published: str | None = None) -> WebSource:
    from app.connectors.web_search import domain_of

    return WebSource(id=f"S{i}", url=url, title=title, text=text, published_date=published,
                     domain=domain_of(url) or "", query="q")


LEDGERLY_SITE = src(
    1, "https://www.ledgerly.dev/", "Ledgerly — reconciliation API for marketplaces",
    "Ledgerly is a reconciliation API for marketplaces. Founded by Maya Chen. "
    "Launched publicly on March 3, 2026 after a private beta.",
)
LEDGERLY_HN = src(
    2, "https://news.ycombinator.com/item?id=4242", "Show HN: Ledgerly, reconcile payouts in one API call",
    "Show HN: Ledgerly – reconcile marketplace payouts in one API call. We built Ledgerly after "
    "running payments at a marketplace. Try it at ledgerly.dev",
)
LEDGERLY_CHANGELOG = src(
    3, "https://ledgerly.dev/changelog/v2", "Ledgerly changelog: v2.0",
    "Ledgerly v2.0 — released October 28, 2026. Adds multi-currency payout matching.",
)


def ledgerly_result(*evidence: dict, **overrides) -> dict:
    r = {
        "company_name": "Ledgerly",
        "website": "https://ledgerly.dev",
        "founder_name": "Maya Chen",
        "github_handle": None,
        "sector": "Fintech",
        "building": {"text": "A reconciliation API for marketplaces.", "source_ids": ["S1"]},
        "why_matched": {"text": "Payments infrastructure launched this year.", "source_ids": ["S1", "S2"]},
        "evidence": list(evidence) or [
            {"source_id": "S1", "kind": "company_site", "claim": "Reconciliation API for marketplaces",
             "quote": "Ledgerly is a reconciliation API for marketplaces.", "event_date": "2026-03-03",
             "date_text": "March 3, 2026"},
            {"source_id": "S2", "kind": "launch", "claim": "Launched on Show HN",
             "quote": "reconcile marketplace payouts in one API call", "event_date": None, "date_text": None},
        ],
        "unknowns": ["Team size"],
    }
    r.update(overrides)
    return r


# ---------------------------------------------------------------------------
# Validation (pure)
# ---------------------------------------------------------------------------

def test_valid_result_keeps_cited_claims_dates_and_domain():
    results, rejected = validate_web_results({"results": [ledgerly_result()]}, [LEDGERLY_SITE, LEDGERLY_HN], now=NOW)
    assert rejected == []
    (r,) = results
    assert r.domain == "ledgerly.dev"
    # the domain is primary; the third-party launch page is kept as a secondary identifier
    assert r.identifiers == [{"kind": "domain", "value": "ledgerly.dev", "verified": True},
                             {"kind": "url", "value": "https://news.ycombinator.com/item?id=4242", "verified": True}]
    assert r.website_basis == "A cited source is on this domain or links to it"
    assert r.founder == {"name": "Maya Chen", "status": "named_unverified",
                         "source_url": LEDGERLY_SITE.url, "profile_url": None}
    site, launch = r.evidence
    assert site["event_date"] == "2026-03-03" and site["date_basis"] == "stated_in_source"
    assert launch["event_date"] is None and launch["date_basis"] is None
    assert "Founder identity not verified" in r.unknowns
    assert "Team size" in r.unknowns


def test_claim_without_retrieved_source_is_rejected():
    bad = ledgerly_result(building={"text": "A reconciliation API.", "source_ids": ["S9"]})
    results, rejected = validate_web_results({"results": [bad]}, [LEDGERLY_SITE, LEDGERLY_HN], now=NOW)
    assert results == []
    assert rejected[0]["reason"] == "A claim was not tied to a retrieved source."


def test_quote_not_in_source_drops_evidence_and_then_result():
    invented = {"source_id": "S1", "kind": "company_site", "claim": "Has 400 customers",
                "quote": "trusted by 400 marketplaces", "event_date": None, "date_text": None}
    results, rejected = validate_web_results({"results": [ledgerly_result(invented)]}, [LEDGERLY_SITE], now=NOW)
    assert results == []
    assert rejected[0]["reason"] == "No evidence quote could be found in its sources."


def test_company_name_must_appear_in_a_cited_source():
    hn_only = ledgerly_result(
        {"source_id": "S2", "kind": "launch", "claim": "Launched on Show HN",
         "quote": "reconcile marketplace payouts in one API call", "event_date": None, "date_text": None},
        company_name="Payoutly",
        building={"text": "Payout reconciliation API.", "source_ids": ["S2"]},
        why_matched={"text": "Payments infrastructure.", "source_ids": ["S2"]},
    )
    results, rejected = validate_web_results({"results": [hn_only]}, [LEDGERLY_SITE, LEDGERLY_HN], now=NOW)
    assert results == [] and "does not appear" in rejected[0]["reason"]


def test_only_company_sites_and_launch_pages_back_claims():
    directory = src(1, "https://fundedstartupsdaily.com/devtools", "59 Developer Tools Startups Funded in 2026",
                    "Ledgerly | Pre-Seed | $1M | Maya Chen Co-founder & CEO | Ledgerly is a reconciliation API for marketplaces.")
    listed = ledgerly_result(
        {"source_id": "S1", "kind": "press", "claim": "Raised a pre-seed round",
         "quote": "Ledgerly is a reconciliation API for marketplaces.", "event_date": None, "date_text": None},
        website=None, why_matched={"text": "Payments.", "source_ids": ["S1"]},
    )
    results, rejected = validate_web_results({"results": [listed]}, [directory], now=NOW)
    assert results == [] and "aren't the company's site or a launch page" in rejected[0]["reason"]

    # a Product Hunt product page is a launch page; a Product Hunt topic listing is not
    from app.services.web_sourcing import is_launch_page

    assert is_launch_page(src(1, "https://www.producthunt.com/products/ledgerly", "Ledgerly", ""))
    assert not is_launch_page(src(1, "https://www.producthunt.com/topics/developer-tools", "Developer tools", ""))
    assert is_launch_page(LEDGERLY_HN)
    assert not is_launch_page(src(1, "https://news.ycombinator.com/item?id=9", "Ask HN: best devtools?", ""))

    (r,), _ = validate_web_results({"results": [ledgerly_result()]}, [LEDGERLY_SITE, LEDGERLY_HN], now=NOW)
    assert [e["source_role"] for e in r.evidence] == ["company_site", "launch_page"]


def test_unsupported_date_becomes_unknown_and_provider_date_is_labeled():
    guessed = {"source_id": "S2", "kind": "launch", "claim": "Launched on Show HN",
               "quote": "reconcile marketplace payouts in one API call",
               "event_date": "2026-02-01", "date_text": "February 2026"}
    (r,), _ = validate_web_results({"results": [ledgerly_result(guessed)]}, [LEDGERLY_SITE, LEDGERLY_HN], now=NOW)
    assert r.evidence[0]["event_date"] is None
    assert "No dated signal in the sources" in r.unknowns

    dated_hn = src(2, LEDGERLY_HN.url, LEDGERLY_HN.title, LEDGERLY_HN.text, published="2026-03-04T15:00:00Z")
    (r,), _ = validate_web_results({"results": [ledgerly_result(guessed)]}, [LEDGERLY_SITE, dated_hn], now=NOW)
    assert r.evidence[0]["event_date"] == "2026-03-04"
    assert r.evidence[0]["date_basis"] == "search_provider"


def test_future_date_is_not_accepted():
    future = {"source_id": "S1", "kind": "company_site", "claim": "Launch",
              "quote": "Launched publicly on March 3, 2026", "event_date": "2027-03-03", "date_text": "March 3, 2026"}
    (r,), _ = validate_web_results({"results": [ledgerly_result(future)]}, [LEDGERLY_SITE], now=NOW)
    assert r.evidence[0]["event_date"] is None


def test_founder_not_on_source_and_unconfirmed_website_stay_unknown():
    hn_only = ledgerly_result(
        {"source_id": "S2", "kind": "launch", "claim": "Launched on Show HN",
         "quote": "reconcile marketplace payouts in one API call", "event_date": None, "date_text": None},
        website="https://ledgerly.io", founder_name="Sam Rivera",
        building={"text": "Payout reconciliation API.", "source_ids": ["S2"]},
        why_matched={"text": "Payments infrastructure.", "source_ids": ["S2"]},
    )
    (r,), _ = validate_web_results({"results": [hn_only]}, [LEDGERLY_HN], now=NOW)
    assert r.domain is None and r.website is None
    assert r.founder["status"] == "unknown" and r.founder["name"] is None
    assert "Founder not identified in the sources" in r.unknowns
    assert "Company website not confirmed by the sources" in r.unknowns
    # with no domain, the launch page URL is the dedup identifier (never the shared host)
    assert r.identifiers == [{"kind": "url", "value": "https://news.ycombinator.com/item?id=4242", "verified": True}]


def test_month_only_date_text_keeps_month_precision_and_model_gaps_are_filtered():
    month = {"source_id": "S1", "kind": "company_site", "claim": "Public launch",
             "quote": "Launched publicly on March 3, 2026", "event_date": "2026-03-01", "date_text": "March 2026"}
    page = src(1, LEDGERLY_SITE.url, LEDGERLY_SITE.title, "Ledgerly launched publicly in March 2026. "
               "Launched publicly on March 3, 2026 after a private beta.")
    (r,), _ = validate_web_results({"results": [ledgerly_result(month, unknowns=[
        "founder_name", "Founder background unclear", "Pricing not stated"])]}, [page], now=NOW)
    assert r.evidence[0]["event_date"] == "2026-03-01" and r.evidence[0]["date_precision"] == "month"
    assert "Pricing not stated" in r.unknowns
    assert "founder_name" not in r.unknowns and "Founder background unclear" not in r.unknowns


def test_canonical_url_keeps_identifying_query_and_drops_tracking():
    from app.connectors.web_search import canonical_url

    assert canonical_url("https://news.ycombinator.com/item?id=4242") != canonical_url("https://news.ycombinator.com/item?id=4243")
    assert canonical_url("http://www.Ledgerly.dev/changelog/?utm_source=x&ref=hn#v2") == "https://ledgerly.dev/changelog"
    assert canonical_url("https://ex.com/p?b=2&a=1") == canonical_url("https://ex.com/p?a=1&b=2")
    assert canonical_url("https://www.ycombinator.com/launches/Qey-zenbu") == \
        canonical_url("https://www.ycombinator.com/launches/Qey-zenbu-the-extensible-ide-for-coding-agents")


def test_domain_must_match_company_name():
    from app.services.web_sourcing import domain_matches_name

    assert domain_matches_name("ledgerly.dev", "Ledgerly")
    assert domain_matches_name("getledgerly.com", "Ledgerly")
    assert domain_matches_name("kilocode.ai", "Kilo Code")
    assert not domain_matches_name("kilo.ai", "Kilo Code")
    assert not domain_matches_name("docs.ledgerly.dev", "Ledgerly")
    assert not domain_matches_name("producthunt.com", "Product Hunt")


def test_malformed_output_is_rejected_not_crashing():
    results, rejected = validate_web_results({"results": [{"company_name": "X"}, "nope"]}, [LEDGERLY_SITE], now=NOW)
    assert results == [] and len(rejected) == 2
    results, rejected = validate_web_results({"companies": []}, [LEDGERLY_SITE], now=NOW)
    assert results == [] and "schema" in rejected[0]["reason"]


# ---------------------------------------------------------------------------
# API flow with fixtures
# ---------------------------------------------------------------------------

class FakeSearch:
    """Stands in for TavilySearch; serves whatever sources the test sets."""

    name = "tavily"
    configured = True
    sources: list[WebSource] = []
    error: WebSearchError | None = None

    def __init__(self, *a, **k):
        pass

    async def search(self, queries, **_kw):
        if FakeSearch.error:
            raise FakeSearch.error
        return WebSearchRun(sources=list(FakeSearch.sources), queries_run=list(queries))


@pytest.fixture
def web(monkeypatch):
    FakeSearch.sources, FakeSearch.error = [], None
    state: dict = {"results": []}
    monkeypatch.setattr("app.services.web_sourcing.TavilySearch", FakeSearch)
    monkeypatch.setattr(ai_services, "plan_web_search",
                        lambda thesis, request: {"queries": ["payments api launch"], "interpretation": "x",
                                                 "planned_by": "openai"})
    monkeypatch.setattr(ai_services, "structure_web_leads", lambda thesis, request, sources: {"results": state["results"]})

    async def no_account(self, login):
        return "not_found", None

    monkeypatch.setattr("app.connectors.github.GitHubConnector.fetch_account", no_account)
    return state


def _search(client, request="Payments infrastructure startups that launched this year"):
    return client.post("/api/sourcing/web/search", json={"request": request})


def test_missing_credentials_are_explicit(client, monkeypatch):
    status = client.get("/api/sourcing/web/status").json()
    assert status["search_configured"] is False and status["provider"] == "tavily"
    r = _search(client)
    assert r.status_code == 503 and r.json()["detail"]["code"] == "not_configured"

    # search configured, AI not: structuring is unavailable (no fake fallback)
    monkeypatch.setattr("app.services.web_sourcing.TavilySearch", FakeSearch)
    r = _search(client)
    assert r.status_code == 503 and r.json().get("ai_unavailable") is True


def test_provider_failures_and_zero_matches(client, web):
    FakeSearch.error = WebSearchError("rate_limited", "Web search rate limit reached.")
    r = _search(client)
    assert r.status_code == 429 and r.json()["detail"]["code"] == "rate_limited"

    FakeSearch.error = WebSearchError("provider_error", "Web search provider error (500).")
    assert _search(client).status_code == 502

    FakeSearch.error = None
    body = _search(client).json()
    assert body["status"] == "no_sources" and body["results"] == []

    FakeSearch.sources = [LEDGERLY_SITE]
    web["results"] = []
    body = _search(client).json()
    assert body["status"] == "no_results" and body["source_count"] == 1


def test_save_dedupe_new_evidence_and_screening_stays_manual(client, web):
    FakeSearch.sources = [LEDGERLY_SITE, LEDGERLY_HN]
    web["results"] = [ledgerly_result()]

    first = _search(client).json()
    (result,) = first["results"]
    assert result["existing"] is None
    # nothing is created until the investor saves
    prospects = client.get("/api/sourcing/prospects").json()["items"]
    assert not any((p["company"] or {}).get("name") == "Ledgerly" for p in prospects)

    saved = client.post(f"/api/sourcing/web/searches/{first['search_id']}/results/{result['key']}/save",
                        json={"status": "saved"}).json()
    opp_id = saved["opportunity_id"]
    assert saved["created"] is True and saved["evidence_added"] == 2
    assert saved["stage"] == "sourcing" and saved["status"] == "saved"

    # same record in Founders and on the Map
    prospects = client.get("/api/sourcing/prospects").json()["items"]
    lead = next(p for p in prospects if p["id"] == opp_id)
    assert lead["company"]["website"] == "https://ledgerly.dev"
    assert lead["evidence_count"] == 2 and lead["new_evidence_count"] == 0
    assert lead["identity"]["founder_named"] == "Maya Chen"
    node = next(n for n in client.get("/api/map").json()["items"] if n["id"] == opp_id)
    assert node["kind"] == "lead" and node["evidence_count"] == 2 and node["new_evidence_count"] == 0
    assert node["group"]["label"] == "Fintech"

    # the same search again: matched, nothing duplicated
    again = _search(client).json()
    (r2,) = again["results"]
    assert r2["existing"]["opportunity_id"] == opp_id
    assert r2["existing"]["evidence_added"] == 0 and r2["existing"]["evidence_known"] == 2
    resave = client.post(f"/api/sourcing/web/searches/{again['search_id']}/results/{r2['key']}/save",
                         json={"status": "monitoring"}).json()
    assert resave["created"] is False and resave["opportunity_id"] == opp_id and resave["evidence_added"] == 0
    leads = [p for p in client.get("/api/sourcing/prospects").json()["items"]
             if (p["company"] or {}).get("name") == "Ledgerly"]
    assert len(leads) == 1 and leads[0]["evidence_count"] == 2

    # a genuinely new source is appended to the existing lead
    FakeSearch.sources = [LEDGERLY_SITE, LEDGERLY_HN, LEDGERLY_CHANGELOG]
    web["results"] = [ledgerly_result(
        {"source_id": "S3", "kind": "release", "claim": "Shipped v2.0 with multi-currency matching",
         "quote": "Adds multi-currency payout matching.", "event_date": "2026-10-28", "date_text": "October 28, 2026"},
        {"source_id": "S1", "kind": "company_site", "claim": "Reconciliation API for marketplaces",
         "quote": "Ledgerly is a reconciliation API for marketplaces.", "event_date": None, "date_text": None},
    )]
    third = _search(client).json()
    assert third["updated_leads"] == [{"opportunity_id": opp_id, "name": "Ledgerly", "evidence_added": 1}]
    statuses = {e["source_id"]: e["status"] for e in third["results"][0]["evidence"]}
    assert statuses == {"S3": "new", "S1": "known"}

    lead = next(p for p in client.get("/api/sourcing/prospects").json()["items"] if p["id"] == opp_id)
    assert lead["evidence_count"] == 3 and lead["new_evidence_count"] == 1
    assert next(n for n in client.get("/api/map").json()["items"] if n["id"] == opp_id)["new_evidence_count"] == 1
    detail = client.get(f"/api/opportunities/{opp_id}").json()
    (new_id,) = detail["new_evidence_ids"]
    new_ev = next(e for e in detail["evidence"] if e["id"] == new_id)
    assert new_ev["kind"] == "web_release" and new_ev["event_date"].startswith("2026-10-28")
    assert new_ev["source_url"] == LEDGERLY_CHANGELOG.url

    # running it once more adds nothing
    assert _search(client).json()["updated_leads"] == []

    client.post(f"/api/opportunities/{opp_id}/evidence/reviewed")
    lead = next(p for p in client.get("/api/sourcing/prospects").json()["items"] if p["id"] == opp_id)
    assert lead["new_evidence_count"] == 0

    # still a lead: Screening requires the explicit investor action
    assert lead["stage"] == "sourcing"
    moved = client.post(f"/api/sourcing/prospects/{opp_id}/action", json={"action": "invite_to_apply"}).json()
    assert moved["stage"] == "screening"


def test_verified_github_match_enriches_and_unverified_does_not(client, web, monkeypatch):
    site = src(1, "https://tidewire.io/", "Tidewire — streaming ETL",
               "Tidewire is streaming ETL for Postgres. Source: github.com/tidewire-labs")
    FakeSearch.sources = [site]
    web["results"] = [{
        "company_name": "Tidewire", "website": "https://tidewire.io", "founder_name": None,
        "github_handle": "tidewire-labs", "sector": "Data",
        "building": {"text": "Streaming ETL for Postgres.", "source_ids": ["S1"]},
        "why_matched": {"text": "Data infrastructure.", "source_ids": ["S1"]},
        "evidence": [{"source_id": "S1", "kind": "company_site", "claim": "Streaming ETL for Postgres",
                      "quote": "Tidewire is streaming ETL for Postgres.", "event_date": None, "date_text": None}],
        "unknowns": [],
    }]

    async def account(self, login):
        if login == "tidewire-labs":
            return "ok", {"login": "tidewire-labs", "type": "Organization", "name": "Tidewire",
                          "blog": "https://tidewire.io", "html_url": "https://github.com/tidewire-labs"}
        return "not_found", None

    monkeypatch.setattr("app.connectors.github.GitHubConnector.fetch_account", account)
    (r,) = _search(client).json()["results"]
    assert r["github"]["verified"] is True and r["github"]["login"] == "tidewire-labs"
    assert {"kind": "github", "value": "tidewire-labs", "verified": True} in r["identifiers"]

    # an account that doesn't link to the domain is never a match
    async def other(self, login):
        return "ok", {"login": login, "type": "User", "name": "Someone", "blog": "https://elsewhere.dev",
                      "html_url": f"https://github.com/{login}"}

    monkeypatch.setattr("app.connectors.github.GitHubConnector.fetch_account", other)
    (r,) = _search(client).json()["results"]
    assert r["github"]["verified"] is False
    assert all(i["kind"] != "github" for i in r["identifiers"])


def test_launch_page_result_gets_its_company_site_and_dedupes_on_either(client, web, monkeypatch):
    ph = src(1, "https://www.producthunt.com/products/quillmark", "Quillmark — docs that write themselves",
             "Quillmark launched today on Product Hunt: docs that update from your code.")
    site = src(1, "https://quillmark.dev/", "Quillmark", "Quillmark keeps developer docs in sync with your code.")

    class TwoStage(FakeSearch):
        async def search(self, queries, **_kw):
            pages = [site] if "official website" in queries[0] else [ph]
            return WebSearchRun(sources=[WebSource(**{**p.__dict__}) for p in pages], queries_run=list(queries))

    monkeypatch.setattr("app.services.web_sourcing.TavilySearch", TwoStage)
    web["results"] = [{
        "company_name": "Quillmark", "website": None, "founder_name": None, "github_handle": None, "sector": "Devtools",
        "building": {"text": "Docs that update from your code.", "source_ids": ["S1"]},
        "why_matched": {"text": "Developer tools launch.", "source_ids": ["S1"]},
        "evidence": [{"source_id": "S1", "kind": "launch", "claim": "Launched on Product Hunt",
                      "quote": "Quillmark launched today on Product Hunt", "event_date": None, "date_text": None}],
        "unknowns": [],
    }]
    body = _search(client).json()
    (r,) = body["results"]
    assert r["domain"] == "quillmark.dev"
    assert r["website_basis"] == "Domain matches the company name and the page names the company"
    assert [e["kind"] for e in r["evidence"]] == ["company_site", "launch"]
    assert r["evidence"][0]["source_id"] == "S2" and body["source_count"] == 2
    assert [i["kind"] for i in r["identifiers"]] == ["domain", "url"]
    saved = client.post(f"/api/sourcing/web/searches/{body['search_id']}/results/{r['key']}/save",
                        json={"status": "saved"}).json()

    # a later search that only finds the launch page still resolves to the same lead
    monkeypatch.setattr("app.services.web_sourcing.TavilySearch", FakeSearch)
    FakeSearch.sources = [ph]
    (again,) = _search(client).json()["results"]
    assert again["domain"] is None
    assert again["existing"]["opportunity_id"] == saved["opportunity_id"]


def test_lead_check_searches_the_leads_own_site_and_appends_only_new(client, web, monkeypatch):
    FakeSearch.sources = [LEDGERLY_SITE, LEDGERLY_HN]
    web["results"] = [ledgerly_result()]
    first = _search(client).json()
    key = first["results"][0]["key"]
    existing = first["results"][0]["existing"]
    if existing:  # saved by an earlier test in this session
        opp_id = existing["opportunity_id"]
    else:
        opp_id = client.post(f"/api/sourcing/web/searches/{first['search_id']}/results/{key}/save",
                             json={"status": "saved"}).json()["opportunity_id"]

    calls: list = []

    class Recording(FakeSearch):
        async def search(self, queries, targeted=None, **_kw):
            calls.append((queries, targeted))
            return WebSearchRun(sources=[LEDGERLY_SITE, LEDGERLY_CHANGELOG], queries_run=list(queries))

    monkeypatch.setattr("app.services.web_sourcing.TavilySearch", Recording)
    web["results"] = [ledgerly_result(
        {"source_id": "S3", "kind": "release", "claim": "Shipped v2.0",
         "quote": "Adds multi-currency payout matching.", "event_date": "2026-10-28", "date_text": "October 28, 2026"},
    )]
    before = next(p for p in client.get("/api/sourcing/prospects").json()["items"] if p["id"] == opp_id)
    out = client.post(f"/api/sourcing/web/check/{opp_id}").json()
    queries, targeted = calls[0]
    assert ("Ledgerly changelog release launch announcement", ["ledgerly.dev"]) in targeted
    assert out["request"].startswith("New releases, launches, or changelog updates from Ledgerly")
    assert out["lead"]["matched"] is True
    after = next(p for p in client.get("/api/sourcing/prospects").json()["items"] if p["id"] == opp_id)
    assert after["evidence_count"] - before["evidence_count"] == out["lead"]["evidence_added"]
    assert after["stage"] == before["stage"]
    again = client.post(f"/api/sourcing/web/check/{opp_id}").json()
    assert again["lead"] == {"opportunity_id": opp_id, "evidence_added": 0, "matched": True}
