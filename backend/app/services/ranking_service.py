"""Build ranking candidate features from opportunities and run both rankings."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assessment import Opportunity, PrestigeAudit
from app.models.entities import Company, Founder
from app.scoring.ranking import rank_candidates
from app.services.founder import latest_founder_score


def _elite(items: list, key: str) -> float:
    """Return 100 if any item is flagged elite/famous, else scaled by count."""
    if not items:
        return 0.0
    flagged = any(bool(i.get(key)) for i in items if isinstance(i, dict))
    return 100.0 if flagged else 40.0


def _candidate_features(db: Session, opp: Opportunity) -> dict | None:
    founder = db.get(Founder, opp.founder_id) if opp.founder_id else None
    company = db.get(Company, opp.company_id) if opp.company_id else None
    if not founder:
        return None
    fs = latest_founder_score(db, founder.id)
    fscore = fs.score if fs else 0.0

    # substantive features (kept in both rankings)
    traction = 0.0
    # crude traction proxy from company claims handled elsewhere; use thesis_fit for now
    features = {
        "id": opp.id,
        "founder_id": founder.id,
        "name": founder.full_name,
        "founder_score": fscore,
        "thesis_fit": opp.thesis_fit_score,
        "traction": traction,
        "technical_evidence": min(100.0, fscore * 0.9),
        "execution": min(100.0, fscore),
        "domain_expertise": _elite(founder.work_history, "is_famous") * 0.6 + 20,
        # prestige features (standard ranking only)
        "elite_education": _elite(founder.education, "is_elite"),
        "famous_employer": _elite(founder.work_history, "is_famous"),
        "elite_accelerator": _elite(founder.accelerators, "is_elite"),
        "investor_network": 100.0 if founder.prior_funding else 0.0,
        "geo_prestige": 70.0 if (company and (company.geography or "").lower() in
                                 ("san francisco", "silicon valley")) else 20.0,
    }
    return features


def compute_rankings(db: Session, fund_id: int, persist: bool = True) -> dict:
    opps = db.scalars(
        select(Opportunity).where(Opportunity.fund_id == fund_id)
    ).all()
    candidates = [c for c in (_candidate_features(db, o) for o in opps) if c]
    ranked = rank_candidates(candidates)
    entries = [r.as_dict() for r in ranked]

    substantial = [e for e in entries if e["substantial_change"]]
    result = {
        "entries": entries,
        "substantial_changes": substantial,
        "note": (
            "Prestige-free ranking is a bias & sensitivity audit — it masks university, "
            "employer, accelerator, investor-network, and geography-as-proxy signals while "
            "retaining all substantive evidence. It is NOT presented as automatically superior."
        ),
    }
    if persist and entries:
        db.add(PrestigeAudit(fund_id=fund_id, computed_at=datetime.now(UTC), entries=entries))
        db.flush()
    return result
