"""Deterministic Founder Score.

The numeric baseline is computed here in pure Python — the language model NEVER
invents the score. Each component is derived from stored evidence, and the
final score is a weighted, confidence-adjusted, missingness-aware roll-up.

The output is fully explainable: every component reports its weight, value,
evidence count, confidence, missingness, and contribution to the final score.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models.sources import Evidence

# Default component weights (sum ~= 1.0). Overridable per-fund via thesis.
DEFAULT_WEIGHTS: dict[str, float] = {
    "execution_consistency": 0.16,
    "technical_evidence": 0.16,
    "product_progress": 0.14,
    "external_validation": 0.10,
    "traction": 0.12,
    "leadership_collaboration": 0.10,
    "learning_velocity": 0.08,
    "domain_experience": 0.08,
    "evidence_reliability": 0.06,
}

# Display names, Title Case (docs/copy-style.md). Keys are the stable identifiers.
COMPONENT_LABELS: dict[str, str] = {
    "execution_consistency": "Execution Consistency",
    "technical_evidence": "Technical Evidence",
    "product_progress": "Product Progress",
    "external_validation": "External Validation",
    "traction": "Traction",
    "leadership_collaboration": "Leadership & Collaboration",
    "learning_velocity": "Learning Velocity",
    "domain_experience": "Domain Experience",
    "evidence_reliability": "Reliability of Evidence",
}

# Which evidence kinds feed which component, and their per-item point value.
# Values are intentionally modest; components saturate so no single signal dominates.
_COMPONENT_SIGNALS: dict[str, dict[str, float]] = {
    "execution_consistency": {
        "github_commit_activity": 34.0,
        "github_repo_maintenance": 22.0,
        "hackathon_followthrough": 30.0,
        "product_launch": 20.0,
    },
    "technical_evidence": {
        "github_repo": 16.0,
        "github_language": 8.0,
        "github_release": 14.0,
        "technical_writeup": 18.0,
    },
    "product_progress": {
        "product_launch": 26.0,
        "product_iteration": 20.0,
        "demo": 18.0,
        "github_release": 12.0,
    },
    "external_validation": {
        "github_outside_contributor": 16.0,
        "press_mention": 22.0,
        "accelerator": 20.0,
        "award": 24.0,
    },
    "traction": {
        "user_growth": 30.0,
        "revenue": 30.0,
        "pilot": 26.0,
        "customer": 22.0,
    },
    "leadership_collaboration": {
        "github_outside_contributor": 18.0,
        "team_growth": 22.0,
        "issue_resolution": 14.0,
        "collaboration": 18.0,
    },
    "learning_velocity": {
        "product_iteration": 18.0,
        "github_release": 12.0,
        "new_domain": 20.0,
        "skill_growth": 18.0,
    },
    "domain_experience": {
        "domain_experience": 30.0,
        "work_history": 18.0,
        "prior_startup": 24.0,
    },
    # evidence_reliability is computed from provenance/verification mix, not signals
    "evidence_reliability": {},
}


@dataclass
class ComponentResult:
    key: str
    name: str
    weight: float
    value: float          # 0..100 component score
    evidence_count: int
    confidence: float     # 0..1
    missingness: float    # 0..1 (1 == no evidence at all)
    contribution: float   # points contributed to final score
    evidence_ids: list[int] = field(default_factory=list)


@dataclass
class FounderScoreResult:
    score: float          # 0..100
    confidence: float     # 0..1
    components: list[ComponentResult]
    evidence_ids: list[int]
    explanation: str

    def components_as_dict(self) -> list[dict]:
        return [
            {
                "key": c.key,
                "name": c.name,
                "weight": round(c.weight, 4),
                "value": round(c.value, 2),
                "evidence_count": c.evidence_count,
                "confidence": round(c.confidence, 3),
                "missingness": round(c.missingness, 3),
                "contribution": round(c.contribution, 2),
                "evidence_ids": c.evidence_ids,
            }
            for c in self.components
        ]


def _saturating(points: float, cap: float = 100.0) -> float:
    """Diminishing-returns curve so no single signal type dominates a component."""
    if points <= 0:
        return 0.0
    # smooth saturation toward `cap`
    return cap * (1.0 - pow(2.718281828, -points / (cap * 0.55)))


def _reliability_component(evidence: list[Evidence]) -> tuple[float, float, float]:
    """Return (value, confidence, missingness) for evidence reliability."""
    if not evidence:
        return 0.0, 0.0, 1.0
    independent = sum(1 for e in evidence if str(e.provenance) == "independent")
    verified = sum(
        1 for e in evidence if str(e.verification_status) in ("verified", "partially_verified")
    )
    n = len(evidence)
    independence_ratio = independent / n
    verification_ratio = verified / n
    value = 100.0 * (0.5 * independence_ratio + 0.5 * verification_ratio)
    confidence = min(1.0, 0.3 + 0.7 * (n / 8.0))
    missingness = max(0.0, 1.0 - n / 4.0)
    return value, confidence, missingness


def compute_founder_score(
    evidence: list[Evidence],
    weights: dict[str, float] | None = None,
) -> FounderScoreResult:
    """Compute the deterministic Founder Score from stored evidence only.

    Missing evidence is handled *fairly*: a component with no evidence reports
    high missingness and low confidence and contributes near-zero — it does not
    punish the founder with a negative value, and it lowers overall confidence
    rather than silently assuming the worst.
    """
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    # renormalize weights so they always sum to 1
    total_w = sum(w.get(k, 0.0) for k in DEFAULT_WEIGHTS) or 1.0

    # bucket evidence by kind
    by_kind: dict[str, list[Evidence]] = {}
    for e in evidence:
        by_kind.setdefault(e.kind, []).append(e)

    components: list[ComponentResult] = []
    weighted_sum = 0.0
    weighted_conf = 0.0
    all_ev_ids: list[int] = []

    for key in DEFAULT_WEIGHTS:
        weight = w.get(key, 0.0) / total_w
        if key == "evidence_reliability":
            value, conf, missing = _reliability_component(evidence)
            used = evidence
        else:
            signals = _COMPONENT_SIGNALS[key]
            points = 0.0
            used = []
            conf_acc = 0.0
            for kind, per_item in signals.items():
                items = by_kind.get(kind, [])
                for e in items:
                    # weight each evidence item by its own confidence
                    points += per_item * max(0.1, float(e.confidence))
                    conf_acc += float(e.confidence)
                    used.append(e)
            value = _saturating(points)
            count = len(used)
            conf = (conf_acc / count) if count else 0.0
            # confidence also scales with how much evidence we have
            conf = min(1.0, conf * min(1.0, 0.4 + count / 6.0)) if count else 0.0
            missing = 1.0 if count == 0 else max(0.0, 1.0 - count / 4.0)

        ev_ids = [e.id for e in used if e.id is not None]
        contribution = weight * value
        weighted_sum += contribution
        weighted_conf += weight * conf
        all_ev_ids.extend(ev_ids)

        components.append(
            ComponentResult(
                key=key,
                name=COMPONENT_LABELS[key],
                weight=weight,
                value=value,
                evidence_count=len(used),
                confidence=conf,
                missingness=missing,
                contribution=contribution,
                evidence_ids=sorted(set(ev_ids)),
            )
        )

    score = round(max(0.0, min(100.0, weighted_sum)), 2)
    confidence = round(max(0.0, min(1.0, weighted_conf)), 3)

    present = [c for c in components if c.evidence_count > 0]
    explanation = _build_explanation(score, confidence, components, present)

    return FounderScoreResult(
        score=score,
        confidence=confidence,
        components=components,
        evidence_ids=sorted(set(all_ev_ids)),
        explanation=explanation,
    )


def _build_explanation(
    score: float,
    confidence: float,
    components: list[ComponentResult],
    present: list[ComponentResult],
) -> str:
    if not present:
        return (
            "Insufficient evidence to compute a confident Founder Score. "
            "No qualifying evidence has been collected yet; connect a GitHub "
            "profile or add an application to begin building the record."
        )
    top = sorted(present, key=lambda c: c.contribution, reverse=True)[:3]
    missing = [c.name for c in components if c.missingness >= 0.99]
    parts = [
        f"Founder Score is {score:.0f}/100 at {confidence * 100:.0f}% confidence, "
        f"driven mainly by "
        + ", ".join(f"{c.name} ({c.value:.0f})" for c in top)
        + "."
    ]
    if missing:
        parts.append(
            "Confidence is limited by missing evidence for: "
            + ", ".join(missing[:4])
            + "."
        )
    return " ".join(parts)
