"""The Dashboard deck in one request: every waiting record (no cap), each with its
group, and counts per group that add up to the deck."""

from __future__ import annotations

from app.services.action_queue import QUEUE_GROUPS, queue_group


def test_dashboard_returns_the_whole_queue_with_grouped_counts(client, seeded):
    for n in range(6):  # more than the old cap of 8 in total
        client.post("/api/applications", json={"company_name": f"Deck Item {n}", "sector": "fintech"})
    d = client.get("/api/dashboard").json()
    queue = d["action_queue"]
    assert len(queue) > 8
    assert sum(g["count"] for g in d["queue_groups"]) == len(queue)
    # groups in deck order, each pointing at its first card
    assert [g["key"] for g in d["queue_groups"]] == [k for k in QUEUE_GROUPS if any(x["group"] == k for x in queue)]
    for g in d["queue_groups"]:
        members = [x for x in queue if x["group"] == g["key"]]
        assert g["count"] == len(members)
        assert g["first_opportunity_id"] == members[0]["opportunity_id"]
    names = {x["name"] for x in queue if x["group"] == "application"}
    assert {f"Deck Item {n}" for n in range(6)} <= names
    for x in queue:
        assert x["waiting_since"]
    # stage names back the stage bar, one per record
    assert {s: len(v) for s, v in d["stage_names"].items()} == d["stage_counts"]


def test_queue_groups():
    assert queue_group("diligence", "review_recommendation") == "recommendation"
    assert queue_group("sourcing", "review_recommendation") == "recommendation"
    assert queue_group("screening", "review_application") == "application"
    assert queue_group("sourcing", "run_analysis") == "lead"
    assert queue_group("diligence", "resolve_diligence") == "diligence"
    assert queue_group("screening", "run_analysis") == "analysis"
    assert queue_group("screening", "generate_memo") == "memo"
