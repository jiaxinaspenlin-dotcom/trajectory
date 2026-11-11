"""Investor Map read model: the same records as Founders + Pipeline, with only
honest plot values and nameable links."""

from __future__ import annotations


def _map(client) -> dict:
    r = client.get("/api/map")
    assert r.status_code == 200
    return r.json()


def _node(body: dict, opp_id: int) -> dict:
    matches = [i for i in body["items"] if i["id"] == opp_id]
    assert len(matches) == 1, f"expected exactly one node for {opp_id}, got {len(matches)}"
    return matches[0]


def test_map_is_the_union_of_founders_and_pipeline(client, seeded):
    body = _map(client)
    ids = [i["id"] for i in body["items"]]
    assert len(ids) == len(set(ids))
    founders = {o["id"] for o in client.get("/api/sourcing/prospects").json()["items"]}
    pipeline = {o["id"] for o in client.get("/api/pipeline").json()["items"]}
    assert set(ids) == founders | pipeline
    for i in body["items"]:
        assert i["kind"] == ("deal" if i["id"] in pipeline else "lead")
        assert i["in_founders"] == (i["id"] in founders)


def test_seeded_records_group_by_sector_and_plot_real_values(client, seeded):
    body = _map(client)
    assert body["has_thesis"] is True
    with_company = [i for i in body["items"] if i["company"]]
    assert with_company
    for i in with_company:
        assert i["group"]["field"] == "company.sector"
        assert i["thesis_fit"]["value"] is not None and i["thesis_fit"]["reason"] is None
    # seeded founders have score history, so some momentum is plottable
    assert any(i["momentum"]["value"] is not None for i in body["items"])


def test_sourced_founder_node_updates_in_place_when_moved_to_screening(client, seeded, stub_github):
    opp_id = client.post("/api/sourcing/github/sync", json={"username": "map-solo"}).json()["opportunity_id"]

    node = _node(_map(client), opp_id)
    assert node["kind"] == "lead" and node["company"] is None
    assert node["group"] == {"key": "language:rust", "label": "Rust projects", "field": "github_repo.language"}
    assert node["top_project"]["name"] == "ledgerkit"
    # placeholder fit and a single score snapshot are unavailable, with reasons
    assert node["thesis_fit"]["value"] is None and "placeholder" in node["thesis_fit"]["reason"]
    assert node["momentum"]["value"] is None
    assert node["momentum"]["trajectory"] == "insufficient_history"
    assert "Insufficient momentum history" in node["momentum"]["reason"]

    client.post(f"/api/sourcing/prospects/{opp_id}/action", json={"action": "invite_to_apply"})
    node = _node(_map(client), opp_id)
    assert node["kind"] == "deal" and node["stage"] == "screening"
    assert node["in_founders"] and node["in_pipeline"]


def test_shared_repo_topics_become_named_links(client, seeded, stub_github):
    a = client.post("/api/sourcing/github/sync", json={"username": "topic-a"}).json()["opportunity_id"]
    b = client.post("/api/sourcing/github/sync", json={"username": "topic-b"}).json()["opportunity_id"]
    links = _map(client)["links"]
    link = next(link for link in links if {link["source"], link["target"]} == {a, b})
    assert link["kind"] == "shared_topic"
    assert link["label"] == "Shared project topics: ledger, payments"
    # every link carries a human-readable relationship
    assert all(link["label"] for link in links)


def test_inbound_application_is_a_deal_without_founder_momentum(client, seeded):
    opp_id = client.post("/api/applications", json={"company_name": "Map Inbound Co", "sector": "fintech"}).json()["opportunity_id"]
    node = _node(_map(client), opp_id)
    assert node["kind"] == "deal" and node["entry_type"] == "inbound" and node["stage"] == "screening"
    assert node["group"]["label"] == "fintech"
    assert node["founder"] is None
    assert node["momentum"]["value"] is None and "No linked founder" in node["momentum"]["reason"]


def test_resynced_founder_without_30_days_of_history_is_not_plotted(client, seeded, stub_github, monkeypatch):
    # Each sync appends a score snapshot, so two syncs minutes apart give the
    # shared momentum code a "30d" change; the Map must still call it insufficient.
    async def sync_with_snapshot(db, founder_id, username, thesis):
        from datetime import UTC, datetime

        from app.models.scoring import FounderMomentumSnapshot
        db.add(FounderMomentumSnapshot(founder_id=founder_id, snapshot_date=datetime.now(UTC), score=40.0, signals={}))
        db.flush()
        return {"status": "success", "message": "stubbed", "evidence_added": 0}

    monkeypatch.setattr("app.api.routes_sourcing.sync_github_user", sync_with_snapshot)
    opp_id = client.post("/api/sourcing/github/sync", json={"username": "twice-synced"}).json()["opportunity_id"]
    client.post("/api/sourcing/github/sync", json={"username": "twice-synced"})

    detail = client.get(f"/api/opportunities/{opp_id}").json()["momentum"]
    assert len(detail["series"]) == 2 and detail["change_30d"] is not None  # shared code reports a change

    node = _node(_map(client), opp_id)
    assert node["momentum"]["value"] is None
    assert node["momentum"]["history_days"] == 0
    assert "spanning 0 days" in node["momentum"]["reason"]
