"""Display text follows docs/copy-style.md: Title Case labels, names intact."""

from __future__ import annotations

from app.services.action_queue import action_label
from app.services.copy import title_case
from app.services.serializers import _display_components


def test_title_case_rule():
    assert title_case("needs attention") == "Needs Attention"
    assert title_case("next up") == "Next Up"
    assert title_case("Recommended: Continue diligence") == "Recommended: Continue Diligence"
    assert title_case("New inbound application · waiting 4d") == "New Inbound Application · Waiting 4d"
    assert title_case("evidence-backed 30-day") == "Evidence-Backed 30-Day"
    assert title_case("idea vs market") == "Idea vs Market"
    assert title_case("github profile via openai") == "GitHub Profile via OpenAI"
    assert title_case("+16.4 pts / 30d") == "+16.4 pts / 30d"
    assert title_case("GitHub ada/ledgerkit-sdk") == "GitHub ada/ledgerkit-sdk"


def test_action_label_is_title_case():
    assert action_label("Continue Diligence") == "Continue Diligence"
    assert action_label("Invite to Apply") == "Invite to Apply"
    assert action_label("continue diligence") == "Continue Diligence"


def test_stored_component_names_display_in_current_case():
    stored = [{"key": "execution_consistency", "name": "Execution consistency"}, {"key": "custom", "name": "custom signal"}]
    assert [c["name"] for c in _display_components(stored)] == ["Execution Consistency", "Custom Signal"]


def test_queue_labels_and_details_are_title_case(client, seeded):
    queue = client.get("/api/dashboard").json()["action_queue"]
    assert queue
    for a in queue:
        assert a["next_action"] == title_case(a["next_action"]), a
        if a["next_action_detail"]:
            assert a["next_action_detail"] == title_case(a["next_action_detail"]), a

