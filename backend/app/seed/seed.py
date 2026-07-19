"""Seed realistic fictional demo data so the app is usable without live APIs.

All demo rows are flagged is_demo=True and clearly labeled in the UI. Demo
evidence is NEVER silently mixed with real founder evidence: real GitHub syncs
create is_demo=False evidence attributed to live sources.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.base import SessionLocal, init_db
from app.models.assessment import AxisAssessment, Opportunity, OpportunityAssessment
from app.models.core import Fund, InvestmentThesis, User
from app.models.entities import Application, Company, Founder, FounderCompanyRelationship
from app.models.enums import (
    EntryType,
    OpportunityStatus,
    Provenance,
    SourceType,
    VerificationStatus,
    WorkflowStage,
)
from app.models.scoring import FounderMomentumSnapshot, FounderScore
from app.models.sources import (
    Claim,
    ClaimContradiction,
    ClaimEvidenceLink,
    Evidence,
)
from app.models.workflow import (
    Debate,
    DebateArgument,
    DiligenceQuestion,
    InvestmentMemo,
    RecommendedAction,
    RefereeDecision,
    TourProgress,
)
from app.scoring.founder_score import compute_founder_score
from app.seed.data import COMPANIES, FOUNDERS
from app.services.context import build_opportunity_context
from app.services.thesis import compute_thesis_fit

NOW = datetime.now(UTC)


def _reset(db: Session) -> None:
    """Delete all rows (demo build starts clean)."""
    from app.db.base import Base

    for table in reversed(Base.metadata.sorted_tables):
        db.execute(delete(table))
    db.commit()


# evidence templates by strength: (kind, title, conf, provenance, status, days_ago)
def _evidence_for(strength: str) -> list[dict]:
    base = [
        ("github_profile", "GitHub profile (demo)", 0.9, "independent", "verified", 400),
        ("github_repo", "Public repo: core-engine", 0.85, "independent", "verified", 300),
        ("github_repo", "Public repo: sdk", 0.85, "independent", "verified", 120),
        ("github_language", "Primary language: Python", 0.75, "independent", "verified", 300),
        ("github_repo_maintenance", "Active maintenance", 0.8, "independent", "verified", 5),
    ]
    if strength in ("high", "medium"):
        base += [
            ("github_release", "6 public releases", 0.85, "independent", "verified", 30),
            ("github_outside_contributor", "3 outside contributors", 0.85, "independent", "verified", 20),
        ]
    if strength == "high":
        base += [
            ("github_commit_activity", "Consistent weekly commits", 0.8, "independent", "verified", 3),
            ("product_launch", "Public product launch", 0.7, "independent", "partially_verified", 45),
            ("demo", "Live demo available", 0.7, "independent", "partially_verified", 40),
            ("product_iteration", "Rapid iteration cadence", 0.7, "independent", "verified", 10),
        ]
    return [
        {"kind": k, "title": t, "confidence": c, "provenance": p, "status": s, "days_ago": d}
        for (k, t, c, p, s, d) in base
    ]


def _make_evidence(db: Session, founder_id: int, company_id: int, strength: str) -> list[Evidence]:
    rows: list[Evidence] = []
    for spec in _evidence_for(strength):
        ev_date = NOW - timedelta(days=spec["days_ago"])
        e = Evidence(
            founder_id=founder_id, company_id=company_id,
            source_name="GitHub (demo)", source_type=SourceType.GITHUB_REPO,
            source_url="https://github.com/example-demo",
            kind=spec["kind"], title=spec["title"], raw_value=spec["title"],
            structured_value={"demo": True},
            event_date=ev_date, collected_at=NOW,
            provenance=Provenance(spec["provenance"]),
            verification_status=VerificationStatus(spec["status"]),
            confidence=spec["confidence"],
            dedup_key=f"demo_{founder_id}_{spec['kind']}_{spec['days_ago']}",
            is_demo=True,
        )
        db.add(e)
        rows.append(e)
    db.flush()
    return rows


def _make_claims(db: Session, founder_id: int, company_id: int, idx: int, evidence: list[Evidence]) -> None:
    """Create claims with MIXED verification statuses + a deliberate contradiction."""
    now = NOW
    repo_ev = [e for e in evidence if e.kind == "github_repo"]

    # independently-supported technical claim
    c1 = Claim(
        founder_id=founder_id, company_id=company_id,
        text="Founder has shipped multiple public repositories with active maintenance.",
        category="technical", owner="Independent (GitHub)", source_name="GitHub (demo)",
        source_url="https://github.com/example-demo", collection_date=now,
        event_date=now - timedelta(days=30), excerpt="Public repos + recent commits",
        structured_value={}, provenance=Provenance.INDEPENDENT,
        verification_status=VerificationStatus.VERIFIED, confidence=0.85, trust_score=80.0, is_demo=True,
    )
    db.add(c1)
    db.flush()
    for e in repo_ev[:2]:
        db.add(ClaimEvidenceLink(claim_id=c1.id, evidence_id=e.id, relation="supports"))

    # founder-reported traction claim (unverified)
    users = 500 + idx * 350
    c2 = Claim(
        founder_id=founder_id, company_id=company_id,
        text=f"The company has {users} monthly active users.",
        category="users", owner="Founder", source_name="Founder application",
        source_url=None, collection_date=now, event_date=now - timedelta(days=10),
        excerpt=f"{users} MAU (deck)", structured_value={"metric": "users", "amount": users},
        provenance=Provenance.FOUNDER_REPORTED,
        verification_status=VerificationStatus.FOUNDER_REPORTED, confidence=0.4,
        trust_score=42.0, is_demo=True,
    )
    db.add(c2)
    db.flush()

    # For a couple of founders, add a CONTRADICTORY users figure -> contradiction
    if idx in (0, 2):
        conflicting = int(users * 0.55)
        c3 = Claim(
            founder_id=founder_id, company_id=company_id,
            text=f"Deck slide 7 shows {conflicting} monthly active users.",
            category="users", owner="Pitch deck", source_name="Pitch deck (demo)",
            source_url=None, collection_date=now, event_date=now - timedelta(days=25),
            excerpt=f"{conflicting} MAU (older slide)",
            structured_value={"metric": "users", "amount": conflicting},
            provenance=Provenance.FOUNDER_REPORTED,
            verification_status=VerificationStatus.CONTRADICTED, confidence=0.35,
            trust_score=28.0, is_demo=True,
        )
        db.add(c3)
        db.flush()
        gap_pct = round((users - conflicting) / users * 100)
        db.add(ClaimContradiction(
            claim_a_id=c2.id, claim_b_id=c3.id,
            description=(
                f"The founder reported {users:,} monthly active users on the application but "
                f"{conflicting:,} on pitch-deck slide 7 — a {gap_pct}% discrepancy in the same "
                "metric. Reconcile before relying on the traction number."
            ),
            severity="high", detected_by="rule", is_demo=True,
        ))
        c2.verification_status = VerificationStatus.CONTRADICTED
        c2.trust_score = 26.0


def _score_versions(db: Session, founder_id: int, evidence: list[Evidence], strength: str) -> None:
    """Create 4 historical score versions + momentum snapshots over 90 days.

    Simulates growth by revealing evidence progressively so momentum is real.
    """
    # order evidence oldest-first
    ev_sorted = sorted(evidence, key=lambda e: e.event_date or NOW)
    checkpoints = [90, 60, 30, 0]
    growth = {"high": 1.0, "medium": 0.8, "low": 0.5}[strength]
    for version, days_ago in enumerate(checkpoints, start=1):
        cutoff = NOW - timedelta(days=days_ago)
        visible = [e for e in ev_sorted if (e.event_date or NOW) <= cutoff]
        # apply a growth factor so later snapshots are stronger
        result = compute_founder_score(visible)
        adj = round(min(100.0, result.score * (0.7 + 0.3 * (version / 4)) * (0.6 + 0.4 * growth)), 2)
        db.add(FounderScore(
            founder_id=founder_id, version=version, score=adj, confidence=result.confidence,
            components=result.components_as_dict(), explanation=result.explanation,
            evidence_ids=result.evidence_ids, computed_at=cutoff, is_demo=True,
        ))
        signals = {
            "commit_activity": max(0, 4 - version + version * 2),
            "release_frequency": max(0, version - 1 + (2 if strength == "high" else 0)),
            "outside_contributors": max(0, version - 2) if strength != "low" else 0,
            "repo_maintenance": version,
            "repo_creation": len([e for e in visible if e.kind == "github_repo"]),
        }
        db.add(FounderMomentumSnapshot(
            founder_id=founder_id, snapshot_date=cutoff, score=adj, signals=signals, is_demo=True,
        ))
    db.flush()


def _seed_static_analysis(db: Session, opp: Opportunity) -> None:
    """Write static, clearly-demo assessment/debate/diligence/memo fixtures.

    These are fixture data (generated_by="demo"), NOT AI output and NOT a
    disguised fallback — they let the demo be browsed without an OpenAI key.
    Content references real evidence/claim IDs for this opportunity.
    """
    ctx = build_opportunity_context(db, opp)
    fscore = ctx["founder_score"]
    momentum = ctx["momentum"]
    ev_ids = [e["id"] for e in ctx["evidence"]]
    claims = ctx["claims"]
    contradictions = ctx["contradictions"]
    thesis_fit = ctx["thesis_fit_score"]
    score = float(fscore.get("score", 0))
    conf = float(fscore.get("confidence", 0.3))
    strong_ev = ev_ids[:5]

    def label(s: float, n: int) -> str:
        if n == 0:
            return "Insufficient Evidence"
        return "Strong" if s >= 75 else "Promising" if s >= 58 else "Mixed" if s >= 40 else "Weak"

    # ---- assessment (three independent axes) ----
    assessment = OpportunityAssessment(
        opportunity_id=opp.id, version=1, generated_by="demo", computed_at=NOW,
    )
    db.add(assessment)
    db.flush()
    axes = [
        ("founder", score, label(score, len(fscore.get("evidence_ids", []))), conf, "neutral",
         [{"text": fscore.get("explanation", "Founder Score computed from evidence."),
           "evidence_ids": fscore.get("evidence_ids", [])[:5], "unverified": False}],
         [], [c["name"] for c in fscore.get("components", []) if c.get("missingness", 0) >= 0.99][:4],
         "Founder axis reflects the persistent Founder Score and momentum; independent of market."),
        ("market", 45.0, "Mixed", 0.35, "neutral",
         [{"text": "Market signals are thin at this stage and not independently verified.",
           "evidence_ids": [], "unverified": True}],
         ["Market sizing not independently verified."], ["Market size", "Growth rate", "Competition"],
         "Market axis assessed independently; conservative where independent evidence is thin."),
        ("idea_vs_market", min(70.0, 40.0 + thesis_fit * 0.3),
         label(min(70.0, 40.0 + thesis_fit * 0.3), len(strong_ev)), 0.4, "neutral",
         [{"text": "Technical feasibility supported by public repositories/releases.",
           "evidence_ids": strong_ev, "unverified": len(strong_ev) == 0}],
         ["Differentiation and distribution need validation."],
         ["Competitive wedge", "Distribution strategy"],
         "Idea-vs-Market assessed independently on thesis fit and technical evidence."),
    ]
    for (axis, sc, lb, cf, outlook, points, risks, missing, narrative) in axes:
        db.add(AxisAssessment(
            assessment_id=assessment.id, axis=axis, display_score=round(sc, 1), label=lb,
            confidence=cf, trend="stable", supporting_evidence_ids=[i for p in points for i in p["evidence_ids"]],
            supporting_points=points, risks=risks, missing_information=missing,
            contradictions=[c["description"] for c in contradictions][:2] if axis == "founder" else [],
            outlook=outlook, narrative=narrative,
        ))

    # ---- debate (bull / bear / referee) ----
    debate = Debate(opportunity_id=opp.id, version=1, generated_by="demo", computed_at=NOW, is_demo=True)
    db.add(debate)
    db.flush()
    bull_points = [
        {"text": f"Founder Score is {score:.0f}/100 with independent GitHub evidence.",
         "evidence_ids": strong_ev, "unverified": len(strong_ev) == 0},
        {"text": f"Founder Momentum is {momentum.get('trajectory', 'n/a')}.",
         "evidence_ids": [], "unverified": True},
    ]
    bear_points = [
        {"text": f"{len([c for c in claims if c['verification_status'] in ('founder_reported', 'unverified')])} "
                 "material claim(s) are founder-reported and lack independent corroboration.",
         "evidence_ids": [], "unverified": True},
    ]
    for con in contradictions[:2]:
        bear_points.insert(0, {"text": f"Contradiction: {con['description']}", "evidence_ids": [], "unverified": True})
    db.add(DebateArgument(debate_id=debate.id, role="bull", headline="Evidence-backed case to advance",
                          points=bull_points, speech_bubble="Momentum and thesis fit look promising.",
                          referenced_evidence_ids=strong_ev))
    db.add(DebateArgument(debate_id=debate.id, role="bear", headline="Evidence-backed case for caution",
                          points=bear_points, speech_bubble="Key claims are unverified.", referenced_evidence_ids=[]))

    action = ("Continue Diligence" if contradictions else
              "Schedule Interview" if (score >= 68 and thesis_fit >= 60 and conf >= 0.6) else
              "Continue Diligence" if score >= 50 else "Monitor")
    db.add(RefereeDecision(
        debate_id=debate.id, recommended_action=action, confidence=round(min(0.9, conf + 0.1), 2),
        strongest_bull_point=bull_points[0]["text"], strongest_bear_point=bear_points[0]["text"],
        unresolved_questions=[c["description"] for c in contradictions][:3] or ["Independent verification of traction claims."],
        required_diligence=["Corroborate founder-reported metrics with independent sources.", "Resolve open contradictions."],
        evidence_that_would_change="Independent verification of traction and resolution of contradictions.",
        final_decision_supportable=bool(score >= 75 and conf >= 0.7 and not contradictions),
        rationale=f"Demo referee: Founder Score {score:.0f} at {conf*100:.0f}% confidence, thesis fit "
                  f"{thesis_fit:.0f}, {len(contradictions)} open contradiction(s). Weighs independence over rhetoric.",
        speech_bubble=f"My call: {action}. Evidence quality drives this.",
    ))
    db.add(RecommendedAction(opportunity_id=opp.id, action=action,
                             rationale="Demo recommendation from the seeded referee.", confidence=round(min(0.9, conf + 0.1), 2),
                             source="referee", created_from_debate_id=debate.id))

    # ---- diligence questions ----
    for con in contradictions[:2]:
        db.add(DiligenceQuestion(opportunity_id=opp.id, question=f"Please reconcile: {con['description']}",
                                 category="contradiction", rationale="Contradictions must be resolved before a confident decision.",
                                 related_claim_ids=[i for i in [con.get("claim_a_id"), con.get("claim_b_id")] if i],
                                 generated_by="demo", is_demo=True))
    for q, cat in [("Provide monthly cohort retention for the last six months.", "traction"),
                   ("Confirm whether current pilots are paid or unpaid, with amounts.", "revenue"),
                   ("Clarify whether repository contributors are employees or independent.", "team")]:
        db.add(DiligenceQuestion(opportunity_id=opp.id, question=q, category=cat,
                                 rationale=f"No {cat} evidence independently verified yet.", related_claim_ids=[],
                                 generated_by="demo", is_demo=True))

    # ---- memo ----
    company = ctx["company"]
    tr_claims = [c for c in claims if c["category"] in ("traction", "revenue", "users")]
    memo_sections = [
        {"key": "snapshot", "title": "Company Snapshot",
         "body": f"{company.get('name')} — {company.get('one_liner') or 'Not disclosed'}. "
                 f"Sector: {company.get('sector') or 'Not disclosed'}. Stage: {company.get('stage') or 'Not disclosed'}.",
         "evidence_ids": strong_ev, "unavailable_label": None},
        {"key": "hypotheses", "title": "Investment Hypotheses",
         "body": f"Founder axis and momentum suggest execution capability (Founder Score {score:.0f}/100). "
                 f"Thesis fit {thesis_fit:.0f}/100. Core hypotheses require independent traction verification.",
         "evidence_ids": fscore.get("evidence_ids", [])[:5], "unavailable_label": None},
        {"key": "swot", "title": "SWOT",
         "body": "Strengths: technical execution on public repositories. Weaknesses: unverified traction. "
                 "Opportunities: thesis-aligned market entry. Threats: competitive uncertainty.",
         "evidence_ids": [], "unavailable_label": None},
        {"key": "traction", "title": "Traction & KPIs",
         "body": " ".join(f"{c['text']} (status: {c['verification_status']}, trust {c['trust_score']:.0f})."
                          for c in tr_claims[:4]) or "No independently verified traction metrics at this stage.",
         "evidence_ids": [c["id"] for c in tr_claims][:4],
         "unavailable_label": None if tr_claims else "Not verified"},
        {"key": "financials", "title": "Financials & Round Structure",
         "body": "Round structure and financials not disclosed at this stage.", "evidence_ids": [],
         "unavailable_label": "Not disclosed"},
    ]
    db.add(InvestmentMemo(opportunity_id=opp.id, version=1, generated_by="demo", computed_at=NOW,
                          sections=memo_sections, recommended_action=action, confidence=round(min(0.9, conf + 0.1), 2),
                          is_demo=True))
    db.flush()


def run_seed() -> dict:
    init_db()
    db = SessionLocal()
    try:
        _reset(db)

        fund = Fund(name="Northstar Ventures (Demo)")
        db.add(fund)
        db.flush()
        user = User(email="demo@trajectory.vc", name="Demo Investor", fund_id=fund.id)
        db.add(user)
        db.flush()
        db.add(TourProgress(user_id=user.id, completed=False, last_step=0))

        thesis = InvestmentThesis(
            fund_id=fund.id, is_active=True, fund_name="Northstar Ventures (Demo)",
            sectors=["fintech", "ai/ml", "devtools", "security"],
            stages=["pre-seed", "seed"],
            geographies=["Boston", "San Francisco", "New York", "Remote"],
            min_check_size=250000, max_check_size=1500000, target_ownership=8.0,
            risk_tolerance="balanced",
            traction_preferences="Evidence of product adoption; independent technical validation.",
            founder_preferences="Technical founders with repeated execution and follow-through.",
            excluded_sectors=["gambling"], excluded_geographies=[], excluded_business_models=["services agency"],
            custom_description="We back technical pre-seed and seed founders building financial and "
                               "developer infrastructure with demonstrable execution.",
            custom_scoring_criteria=[], score_weights={},
        )
        db.add(thesis)
        db.flush()

        opportunities: list[Opportunity] = []
        for idx, (fdata, cdata) in enumerate(zip(FOUNDERS, COMPANIES, strict=True)):
            founder = Founder(
                full_name=fdata["full_name"], normalized_name=fdata["full_name"].lower(),
                github_username=fdata["github_username"], location=fdata["location"],
                headline=fdata["headline"], bio=f"{fdata['headline']} (demo founder).",
                education=fdata["education"], work_history=fdata["work_history"],
                accelerators=fdata["accelerators"], prior_funding=fdata["prior_funding"],
                is_demo=True,
            )
            db.add(founder)
            db.flush()

            company = Company(
                name=cdata["name"], normalized_name=cdata["name"].lower(),
                sector=cdata["sector"], stage=cdata["stage"], geography=cdata["geography"],
                business_model=cdata["business_model"], one_liner=cdata["one_liner"],
                description=f"{cdata['one_liner']}. Fictional demo company.",
                github_org=cdata["github_org"], is_demo=True,
            )
            db.add(company)
            db.flush()
            db.add(FounderCompanyRelationship(
                founder_id=founder.id, company_id=company.id, role="Founder", is_current=True,
                started_at=NOW - timedelta(days=400),
            ))

            evidence = _make_evidence(db, founder.id, company.id, fdata["evidence_strength"])
            _make_claims(db, founder.id, company.id, idx, evidence)
            _score_versions(db, founder.id, evidence, fdata["evidence_strength"])

            fit, reasons = compute_thesis_fit(thesis, company)
            entry = EntryType.INBOUND if idx % 3 == 0 else EntryType.OUTBOUND
            stage = WorkflowStage.SCREENING if entry == EntryType.INBOUND else WorkflowStage.SOURCING
            status = OpportunityStatus.APPLIED if entry == EntryType.INBOUND else OpportunityStatus.SAVED
            # stagger first_signal so 24h timers vary
            signal_at = NOW - timedelta(hours=[2, 8, 20, 30, 5, 12, 26, 1][idx])
            opp = Opportunity(
                fund_id=fund.id, founder_id=founder.id, company_id=company.id,
                entry_type=entry, stage=stage, status=status,
                first_signal_at=signal_at, thesis_fit_score=fit,
                surfaced_reason=("Inbound application. " if entry == EntryType.INBOUND
                                 else "Surfaced from public GitHub execution signals. ") + " ".join(reasons[:1]),
                is_demo=True,
            )
            db.add(opp)
            db.flush()
            opportunities.append(opp)

            if entry == EntryType.INBOUND:
                db.add(Application(
                    company_id=company.id, company_name=company.name,
                    founder_names=[founder.full_name], sector=company.sector,
                    geography=company.geography, github_profile=founder.github_username,
                    num_users=500 + idx * 350,
                    screen_summary=f"First-pass screen for {company.name}: GitHub available for "
                                   "independent verification; founder-reported traction requires verification.",
                    missing_fields=["traction_signal (revenue or users)"], is_demo=True,
                ))

        db.commit()

        # Ship the demo with completed assessments, >=2 debates, diligence, and
        # memos as STATIC demo fixtures (not AI calls) so the app is fully
        # browsable without an OpenAI key. Live regeneration uses OpenAI.
        for opp in opportunities[:3]:
            _seed_static_analysis(db, opp)
            opp.stage = WorkflowStage.DILIGENCE
            opp.recommendation_at = NOW - timedelta(hours=1)
        db.commit()

        counts = {
            "founders": len(FOUNDERS), "companies": len(COMPANIES),
            "opportunities": len(opportunities),
            "analyzed_opportunities": 3,
        }
        return counts
    finally:
        db.close()


if __name__ == "__main__":
    result = run_seed()
    print("Seed complete:", result)
