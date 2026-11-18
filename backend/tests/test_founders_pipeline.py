"""Founders -> Screening -> Pipeline: one opportunity record moves between the
two investor views by stable ID, never duplicated."""

from __future__ import annotations


def _pipeline_ids(client, **params) -> list[int]:
    r = client.get("/api/pipeline", params=params)
    assert r.status_code == 200
    return [o["id"] for o in r.json()["items"]]


def test_github_prospect_flows_from_founders_to_pipeline(client, seeded, stub_github):
    sync = client.post("/api/sourcing/github/sync", json={"username": "solo-builder"})
    assert sync.status_code == 200
    opp_id = sync.json()["opportunity_id"]

    # Founders: present, no company yet, evidence + project surfaced honestly.
    prospects = client.get("/api/sourcing/prospects").json()["items"]
    row = next(p for p in prospects if p["id"] == opp_id)
    assert row["company"] is None
    assert row["founder"]["github_username"] == "solo-builder"
    assert row["stage"] == "sourcing"
    assert row["evidence_count"] == 1
    assert row["top_project"] == {"name": "ledgerkit", "url": "https://github.com/solo-builder/ledgerkit", "stars": 42}
    # A sourcing-stage lead is not yet an active deal.
    assert opp_id not in _pipeline_ids(client)

    # Investor-approved move to screening, on the same opportunity ID.
    act = client.post(f"/api/sourcing/prospects/{opp_id}/action", json={"action": "invite_to_apply"})
    assert act.status_code == 200
    assert act.json()["stage"] == "screening"
    assert "No outreach sent" in act.json()["detail"]

    pipeline = client.get("/api/pipeline").json()["items"]
    deal = next(o for o in pipeline if o["id"] == opp_id)
    assert deal["stage"] == "screening" and deal["entry_type"] == "outbound"
    assert deal["next_action"] == "Run Analysis"
    assert deal["next_action_key"] == "run_analysis"
    assert _pipeline_ids(client).count(opp_id) == 1

    # Still discoverable in Founders, now showing its pipeline stage.
    prospects = client.get("/api/sourcing/prospects").json()["items"]
    assert [p["stage"] for p in prospects if p["id"] == opp_id] == ["screening"]

    # Re-syncing the same profile reuses the record rather than duplicating it.
    again = client.post("/api/sourcing/github/sync", json={"username": "solo-builder"})
    assert again.json()["opportunity_id"] == opp_id
    assert _pipeline_ids(client).count(opp_id) == 1


def test_screening_action_never_moves_a_deal_backwards(client, seeded):
    diligence = client.get("/api/opportunities", params={"stage": "diligence", "entry_type": "outbound"}).json()["items"]
    opp_id = diligence[0]["id"]
    act = client.post(f"/api/sourcing/prospects/{opp_id}/action", json={"action": "invite_to_apply"})
    assert act.json()["stage"] == "diligence"
    assert client.get(f"/api/opportunities/{opp_id}").json()["stage"] == "diligence"


def test_inbound_application_enters_pipeline_at_screening(client, seeded):
    r = client.post("/api/applications", json={"company_name": "Pipeline Test Co", "sector": "fintech"})
    opp_id = r.json()["opportunity_id"]

    inbound = client.get("/api/pipeline", params={"entry_type": "inbound", "stage": "screening"}).json()["items"]
    deal = next(o for o in inbound if o["id"] == opp_id)
    assert deal["founder"] is None and deal["company"]["name"] == "Pipeline Test Co"
    assert deal["next_action"] == "Review Application"
    assert deal["next_action_key"] == "review_application"
    # inbound applications never show up as outbound leads in Founders
    assert opp_id not in [p["id"] for p in client.get("/api/sourcing/prospects").json()["items"]]
    assert opp_id not in _pipeline_ids(client, entry_type="outbound")


def test_pipeline_excludes_sourcing_and_dismissed(client, seeded):
    items = client.get("/api/pipeline").json()["items"]
    assert items
    assert all(o["stage"] in {"screening", "diligence", "decision"} for o in items)
    assert all(o["status"] != "dismissed" for o in items)


def test_pipeline_rejects_unknown_filters(client, seeded):
    assert client.get("/api/pipeline", params={"stage": "sourcing"}).status_code == 422
    assert client.get("/api/pipeline", params={"entry_type": "referral"}).status_code == 422


def test_decision_requires_an_explicit_outcome_and_action(client, seeded):
    opp_id = client.get("/api/pipeline").json()["items"][0]["id"]
    url = f"/api/opportunities/{opp_id}/decision"
    base = {"decided_by": "Investor", "decision": "approved", "chosen_action": "Continue Diligence"}
    assert client.post(url, json={**base, "decision": ""}).status_code == 422
    assert client.post(url, json={**base, "chosen_action": ""}).status_code == 422
    assert client.post(url, json={**base, "decided_by": ""}).status_code == 422
    assert client.post(url, json=base).status_code == 200
    history = client.get(f"/api/opportunities/{opp_id}/decisions").json()["items"]
    assert history[-1]["chosen_action"] == "Continue Diligence"


def test_dashboard_recent_evidence_names_its_opportunity(client, seeded):
    items = client.get("/api/dashboard").json()["recent_evidence"]
    linked = [e for e in items if e["opportunity_id"]]
    assert linked, "seeded evidence belongs to seeded opportunities"
    assert all(e["opportunity_name"] for e in linked)
