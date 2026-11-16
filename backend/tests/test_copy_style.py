"""Display text follows docs/copy-style.md: sentence case, names intact."""

from __future__ import annotations

from app.services.action_queue import action_label


def test_action_label_is_sentence_case_for_display():
    assert action_label("Continue Diligence") == "Continue diligence"
    assert action_label("Invite to Apply") == "Invite to apply"
    assert action_label("Pass") == "Pass"


def test_queue_detail_shows_the_recommendation_in_sentence_case(client, seeded):
    queue = client.get("/api/dashboard").json()["action_queue"]
    details = [a["next_action_detail"] for a in queue if a["next_action_key"] == "review_recommendation"]
    assert details
    for d in details:
        assert d.startswith("Recommended: ")
        rest = d.removeprefix("Recommended: ").split()
        assert all(w == w.lower() for w in rest[1:]), d
