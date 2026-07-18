"""Endpoint behavior + a full happy-path end-to-end workflow test."""

from __future__ import annotations

import io


def _make_pdf_bytes() -> bytes:
    """Build a valid 2-page PDF using pypdf (proper xref, parseable)."""
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["ai"]["enabled"] is False  # no key in tests


def test_settings_never_leaks_full_key(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    body = r.json()
    # hints only, never full keys
    assert "key_hint" in body["openai"]
    assert body["openai"]["key_hint"] in ("", "set") or body["openai"]["key_hint"].startswith("…")
    assert "github" in body["live_connectors"]


def test_ai_endpoints_return_503_without_key(client, seeded):
    # No OPENAI_API_KEY in the test env -> AI features are unavailable, not faked.
    r = client.post("/api/opportunities/1/assessment")
    assert r.status_code == 503
    assert r.json()["ai_unavailable"] is True
    r2 = client.post("/api/search/parse", json={"query": "fintech founders in Boston"})
    assert r2.status_code == 503


def test_thesis_crud(client):
    payload = {
        "fund_name": "Test Fund", "sectors": ["fintech"], "stages": ["seed"],
        "geographies": ["Boston"], "min_check_size": 100000, "max_check_size": 1000000,
        "target_ownership": 10, "risk_tolerance": "balanced",
        "excluded_sectors": ["gambling"],
    }
    r = client.post("/api/thesis", json=payload)
    assert r.status_code == 200
    tid = r.json()["thesis"]["id"]
    r2 = client.put(f"/api/thesis/{tid}", json={**payload, "fund_name": "Updated Fund"})
    assert r2.json()["thesis"]["fund_name"] == "Updated Fund"
    assert "impact" in r2.json()


def test_connector_status_honest(client):
    r = client.get("/api/connectors/status")
    assert r.status_code == 200
    body = r.json()
    assert any(c["connector"] == "github" and c["live"] for c in body["live"])
    # planned connectors are honestly reported as not implemented
    assert all(c["live"] is False for c in body["planned_unavailable"])


def test_full_happy_path(client, seeded, mock_ai):
    """Thesis -> inbound -> deck -> evidence -> score -> screening -> diligence
    -> arena -> memo -> recommendation -> human decision.

    `mock_ai` stubs the OpenAI provider (no key/network) so the AI-dependent
    analyze step runs the real parse/validation/persistence code paths."""
    # 1. thesis exists
    assert client.get("/api/thesis").json()["thesis"] is not None

    # 2. create inbound application (company name required)
    app_resp = client.post("/api/applications", json={"company_name": "E2E Robotics", "sector": "ai/ml"})
    assert app_resp.status_code == 200
    app_id = app_resp.json()["application_id"]
    opp_id = app_resp.json()["opportunity_id"]
    assert app_resp.json()["missing_fields"]  # identifies missing info

    # 3. upload + parse a real PDF pitch deck
    files = {"file": ("deck.pdf", io.BytesIO(_make_pdf_bytes()), "application/pdf")}
    up = client.post(f"/api/applications/{app_id}/upload-deck", files=files)
    assert up.status_code == 200
    assert up.json()["num_pages"] >= 1
    assert up.json()["extraction_status"] == "extracted"

    # invalid file type rejected
    bad = client.post(f"/api/applications/{app_id}/upload-deck",
                      files={"file": ("x.txt", io.BytesIO(b"hi"), "text/plain")})
    assert bad.status_code == 422

    # 4. run full analysis pipeline (screening -> diligence -> arena -> memo)
    analyze = client.post(f"/api/opportunities/{opp_id}/analyze")
    assert analyze.status_code == 200

    detail = client.get(f"/api/opportunities/{opp_id}").json()
    # three independent axes present, not averaged
    axes = {a["axis"] for a in detail["assessment"]["axes"]}
    assert axes == {"founder", "market", "idea_vs_market"}
    # arena has bull/bear + referee recommendation
    roles = {a["role"] for a in detail["debate"]["arguments"]}
    assert roles == {"bull", "bear"}
    assert detail["debate"]["referee"]["recommended_action"]
    # memo generated
    assert detail["memo"]["sections"]
    # workflow tracked
    assert detail["workflow"]["target_hours"] == 24

    # 5. record a SEPARATE human decision
    dec = client.post(f"/api/opportunities/{opp_id}/decision", json={
        "decided_by": "Partner A", "decision": "approved",
        "chosen_action": "Schedule Interview", "notes": "Looks promising",
    })
    assert dec.status_code == 200
    body = dec.json()
    assert body["human_decision"]["decision"] == "approved"
    # human decision stored separately from system recommendation
    assert "system_recommended_action" in body["human_decision"]


def test_evidence_ref_validation_endpoint(client, seeded):
    # opportunity 1 exists from seed
    r = client.post("/api/opportunities/1/validate-evidence-refs",
                    json={"evidence_ids": [1, 2, 999999]})
    assert r.status_code == 200
    assert 999999 in r.json()["rejected_evidence_ids"]
    assert r.json()["all_valid"] is False


def test_ranking_and_prestige_audit(client, seeded):
    r = client.get("/api/ranking/prestige-sensitivity")
    assert r.status_code == 200
    entries = r.json()["entries"]
    assert len(entries) >= 2
    for e in entries:
        assert "standard_rank" in e and "prestige_free_rank" in e
    assert "bias & sensitivity audit" in r.json()["note"]


def test_search_parse_shows_editable_filters(client, mock_ai):
    r = client.post("/api/search/parse", json={"query": "technical seed founders in Boston fintech"})
    assert r.status_code == 200
    assert "filters" in r.json()
    assert "not the entire internet" in r.json()["disclaimer"]
