"""AI validation layer, malformed AI handling, and fallback behavior tests."""

from __future__ import annotations

from app.ai import services as ai
from app.ai.provider import AIError, _extract_json
from app.ai.validation import sanitize_points, validate_evidence_ids


def test_reject_nonexistent_evidence_ids():
    valid, rejected = validate_evidence_ids([1, 2, 999, "3", "bad"], {1, 2, 3})
    assert valid == [1, 2, 3]
    assert rejected == [999]


def test_sanitize_points_flags_unverified():
    points = [
        {"text": "backed", "evidence_ids": [1, 2]},
        {"text": "hallucinated", "evidence_ids": [999]},
        {"text": "empty", "evidence_ids": []},
    ]
    clean, rejected = sanitize_points(points, {1, 2})
    assert clean[0]["unverified"] is False
    assert clean[1]["unverified"] is True  # all IDs invalid
    assert 999 in rejected
    assert clean[2]["unverified"] is True


def test_extract_json_handles_fences_and_prose():
    assert _extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _extract_json('Here you go: {"b": 2} thanks') == {"b": 2}


def test_extract_json_raises_on_garbage():
    try:
        _extract_json("no json here")
        raise AssertionError("should have raised")
    except AIError:
        pass


def test_search_parse_fallback_is_honest():
    r = ai.parse_search(
        "Find technical pre-seed founders in Boston building financial infrastructure "
        "with product adoption and no prior institutional funding",
        ["Internal indexed dataset", "GitHub"],
    )
    assert r["generated_by"] == "fallback"  # no API key in tests
    assert "fintech" in r["sectors"]
    assert "pre-seed" in r["stages"]
    assert "Boston" in r["geographies"]
    assert r["technical_founder"] is True
    assert r["requires_product_adoption"] is True
    assert "Internal indexed dataset" in r["searched_sources"]


def test_axes_never_averaged_and_independent():
    context = {
        "evidence": [{"id": 1, "kind": "github_repo", "confidence": 0.8}],
        "claims": [],
        "founder_score": {"score": 80, "confidence": 0.7, "evidence_ids": [1], "explanation": "x", "components": []},
        "momentum": {"trajectory": "improving", "explanation": "up"},
        "thesis_fit_score": 70,
        "contradictions": [],
    }
    r = ai.assess_axes(context)
    axes = {a["axis"]: a for a in r["axes"]}
    assert set(axes) == {"founder", "market", "idea_vs_market"}
    # three distinct scores preserved (not collapsed to one average)
    scores = [a["display_score"] for a in r["axes"]]
    assert len(scores) == 3


def test_referee_judges_on_quality_not_prose():
    context = {
        "evidence": [{"id": i, "kind": "github_repo", "confidence": 0.8, "provenance": "independent"} for i in range(1, 5)],
        "claims": [], "contradictions": [],
        "founder_score": {"score": 80, "confidence": 0.75, "evidence_ids": [1, 2]},
        "momentum": {"trajectory": "accelerating"}, "thesis_fit_score": 70,
        "entry_type": "outbound",
    }
    bull = ai.generate_bull(context)
    bear = ai.generate_bear(context)
    ref = ai.generate_referee(context, bull, bear)
    assert ref["recommended_action"] in {
        "Invite to Apply", "Schedule Interview", "Request Information",
        "Continue Diligence", "Monitor", "Invest", "Pass",
    }
    # contradictions present should force Continue Diligence
    context["contradictions"] = [{"description": "conflict", "claim_a_id": 1, "claim_b_id": 2}]
    ref2 = ai.generate_referee(context, bull, bear)
    assert ref2["recommended_action"] == "Continue Diligence"


def test_referee_not_supportable_when_evidence_thin():
    context = {
        "evidence": [], "claims": [], "contradictions": [],
        "founder_score": {"score": 20, "confidence": 0.2, "evidence_ids": []},
        "momentum": {"trajectory": "insufficient_history"}, "thesis_fit_score": 10,
        "entry_type": "inbound",
    }
    ref = ai.generate_referee(context, ai.generate_bull(context), ai.generate_bear(context))
    assert ref["final_decision_supportable"] is False


def test_pitch_fallback_invents_nothing():
    pages = [{"page": 1, "text": "We are building a great product for teams."}]
    r = ai.interpret_pitch_deck(pages)
    assert r["generated_by"] == "fallback"
    assert r["metrics"] == []  # no invented numbers
    assert "revenue" in r["missing"]
