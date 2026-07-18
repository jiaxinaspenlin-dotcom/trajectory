"""AI validation layer, malformed-JSON handling, no-key behavior, mocked provider."""

from __future__ import annotations

import pytest
from app.ai import services as ai
from app.ai.provider import AIError, _extract_json
from app.ai.validation import sanitize_points, validate_evidence_ids

# ---- validation layer (provider-independent) ------------------------------

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
    with pytest.raises(AIError):
        _extract_json("no json here")


# ---- no-key behavior: services raise AIError (there is NO fallback) --------

def test_services_raise_without_api_key():
    # provider.enabled is False in the test env (no OPENAI_API_KEY)
    ctx = {"evidence": [], "claims": [], "contradictions": [], "founder_score": {}, "momentum": {}}
    with pytest.raises(AIError):
        ai.assess_axes(ctx)
    with pytest.raises(AIError):
        ai.parse_search("fintech founders", ["Internal dataset"])
    with pytest.raises(AIError):
        ai.generate_bull(ctx)


# ---- with a mocked provider: real parsing + validation paths run ----------

def test_axes_three_independent_and_ids_validated(mock_ai):
    context = {
        "evidence": [{"id": 1, "kind": "github_repo", "confidence": 0.8, "provenance": "independent",
                      "verification_status": "verified"}],
        "claims": [], "contradictions": [],
        "founder_score": {"score": 80, "confidence": 0.7, "evidence_ids": [1], "explanation": "x", "components": []},
        "momentum": {"trajectory": "improving"}, "thesis_fit_score": 70,
    }
    r = ai.assess_axes(context)
    assert r["generated_by"] == "openai"
    axes = {a["axis"] for a in r["axes"]}
    assert axes == {"founder", "market", "idea_vs_market"}
    # three distinct scores preserved (not averaged)
    assert len(r["axes"]) == 3
    # the hallucinated evidence id 999999 from the stub must be stripped
    founder_axis = next(a for a in r["axes"] if a["axis"] == "founder")
    assert 999999 not in founder_axis["supporting_evidence_ids"]
    assert 1 in founder_axis["supporting_evidence_ids"]


def test_referee_action_normalized(mock_ai):
    context = {"evidence": [], "claims": [], "contradictions": [], "founder_score": {"score": 60, "confidence": 0.6},
               "momentum": {}, "thesis_fit_score": 60, "entry_type": "outbound"}
    bull = ai.generate_bull(context)
    bear = ai.generate_bear(context)
    ref = ai.generate_referee(context, bull, bear)
    # stub returns an invalid action -> normalized to a valid one
    assert ref["recommended_action"] in {
        "Invite to Apply", "Schedule Interview", "Request Information",
        "Continue Diligence", "Monitor", "Invest", "Pass",
    }
    assert ref["recommended_action"] == "Continue Diligence"


def test_bear_point_without_evidence_is_unverified(mock_ai):
    context = {"evidence": [{"id": 1, "kind": "x", "confidence": 0.5}], "claims": [], "contradictions": [],
               "founder_score": {}, "momentum": {}, "thesis_fit_score": 0}
    bear = ai.generate_bear(context)
    assert bear["points"][0]["unverified"] is True  # stub bear point has no evidence ids


def test_pitch_extraction_with_mock(mock_ai):
    r = ai.interpret_pitch_deck([{"page": 1, "text": "team building product"}])
    assert r["generated_by"] == "openai"
    assert "revenue" in r["missing"]
