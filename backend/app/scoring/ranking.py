"""Standard and Prestige-Free ranking — a bias & sensitivity audit.

The standard ranking may use approved prestige evidence (elite university,
famous employer, top accelerator, prior-investor access, geography-as-proxy).
The prestige-free ranking masks those variables while RETAINING all substantive
evidence (what was built, product progress, technical contributions, real
traction, customer validation, repeated execution, collaboration, leadership,
learning speed, domain expertise).

We do not claim the prestige-free result is "better" — it is a sensitivity audit
that shows how much prestige signals move the ranking.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Substantive (kept in both rankings) feature weights.
SUBSTANTIVE_WEIGHTS: dict[str, float] = {
    "founder_score": 0.34,        # persistent, evidence-based
    "thesis_fit": 0.20,
    "traction": 0.16,
    "technical_evidence": 0.12,
    "execution": 0.10,
    "domain_expertise": 0.08,
}

# Prestige features (used ONLY in the standard ranking).
PRESTIGE_WEIGHTS: dict[str, float] = {
    "elite_education": 0.30,
    "famous_employer": 0.28,
    "elite_accelerator": 0.22,
    "investor_network": 0.12,
    "geo_prestige": 0.08,
}

PRESTIGE_LABELS: dict[str, str] = {
    "elite_education": "elite university brand",
    "famous_employer": "famous employer brand",
    "elite_accelerator": "elite accelerator brand",
    "investor_network": "prior investor-network access",
    "geo_prestige": "geography used as a prestige proxy",
}

# How much prestige counts toward the *standard* composite (the rest is substance).
PRESTIGE_SHARE = 0.30


@dataclass
class RankedCandidate:
    candidate_id: int
    founder_id: int | None
    name: str
    substantive_score: float
    prestige_score: float
    standard_score: float
    prestige_free_score: float
    standard_rank: int = 0
    prestige_free_rank: int = 0
    rank_delta: int = 0
    influential_prestige_variables: list[dict] = field(default_factory=list)
    sensitivity: float = 0.0          # 0..1: how much prestige shifts the score
    substantial_change: bool = False

    def as_dict(self) -> dict:
        return {
            "candidate_id": self.candidate_id,
            "founder_id": self.founder_id,
            "name": self.name,
            "standard_rank": self.standard_rank,
            "prestige_free_rank": self.prestige_free_rank,
            "rank_delta": self.rank_delta,
            "standard_score": round(self.standard_score, 2),
            "prestige_free_score": round(self.prestige_free_score, 2),
            "substantive_score": round(self.substantive_score, 2),
            "prestige_score": round(self.prestige_score, 2),
            "influential_prestige_variables": self.influential_prestige_variables,
            "sensitivity": round(self.sensitivity, 3),
            "substantial_change": self.substantial_change,
        }


def _weighted(features: dict[str, float], weights: dict[str, float]) -> float:
    total_w = sum(weights.values()) or 1.0
    return sum(weights[k] * float(features.get(k, 0.0)) for k in weights) / total_w


def rank_candidates(candidates: list[dict]) -> list[RankedCandidate]:
    """Rank candidates two ways.

    Each candidate dict must provide 0..100 valued features:
      substantive: founder_score, thesis_fit, traction, technical_evidence,
                   execution, domain_expertise
      prestige:    elite_education, famous_employer, elite_accelerator,
                   investor_network, geo_prestige
    plus: id, founder_id, name.
    """
    ranked: list[RankedCandidate] = []
    for c in candidates:
        substantive = _weighted(c, SUBSTANTIVE_WEIGHTS)
        prestige = _weighted(c, PRESTIGE_WEIGHTS)
        standard = (1 - PRESTIGE_SHARE) * substantive + PRESTIGE_SHARE * prestige
        prestige_free = substantive  # prestige fully masked

        # which prestige variables actually moved this candidate
        influential: list[dict[str, Any]] = []
        total_pw = sum(PRESTIGE_WEIGHTS.values())
        for key, w in PRESTIGE_WEIGHTS.items():
            val = float(c.get(key, 0.0))
            contribution = PRESTIGE_SHARE * (w / total_pw) * val
            if val > 0:
                influential.append(
                    {
                        "variable": key,
                        "label": PRESTIGE_LABELS[key],
                        "value": round(val, 1),
                        "score_contribution": round(contribution, 2),
                    }
                )
        influential.sort(key=lambda d: d["score_contribution"], reverse=True)

        sensitivity = abs(standard - prestige_free) / 100.0

        ranked.append(
            RankedCandidate(
                candidate_id=int(c["id"]),
                founder_id=c.get("founder_id"),
                name=c.get("name", ""),
                substantive_score=substantive,
                prestige_score=prestige,
                standard_score=standard,
                prestige_free_score=prestige_free,
                influential_prestige_variables=influential,
                sensitivity=sensitivity,
            )
        )

    # assign ranks (1 = best)
    for rank, rc in enumerate(sorted(ranked, key=lambda r: r.standard_score, reverse=True), 1):
        rc.standard_rank = rank
    for rank, rc in enumerate(
        sorted(ranked, key=lambda r: r.prestige_free_score, reverse=True), 1
    ):
        rc.prestige_free_rank = rank

    for rc in ranked:
        rc.rank_delta = rc.standard_rank - rc.prestige_free_rank
        # a "substantial" change: moves 2+ positions or sensitivity high
        rc.substantial_change = abs(rc.rank_delta) >= 2 or rc.sensitivity >= 0.12

    # return in standard-rank order
    ranked.sort(key=lambda r: r.standard_rank)
    return ranked
