"""Remove fictional demo data, keeping ONE demo prospect as a reference example.

Deletes the seeded demo founders/companies/prospects and everything attached to
them, EXCEPT one (default: Inferra — a fully-analyzed outbound prospect with an
assessment, Investment Arena, memo, claims and a contradiction). Keeps the fund,
thesis, user, and any REAL data (e.g. founders sourced from live GitHub).

`python -m app.seed.clear_demo --all` (clear_demo(keep_company=None)) removes
every demo row, deletes the demo thesis if it is still named
"Northstar Ventures (Demo)", and renames the demo fund to "My fund". Real
records are never touched.

Reversible: run `python -m app.seed.seed --force` to restore the full demo
(this replaces ALL data, real records included).
"""

from __future__ import annotations

import sys

from sqlalchemy import delete, select

from app.db.base import SessionLocal, init_db
from app.models.assessment import AxisAssessment, Opportunity, OpportunityAssessment
from app.models.core import Fund, InvestmentThesis
from app.models.entities import Application, Company, Founder, FounderCompanyRelationship
from app.models.scoring import FounderMomentumSnapshot, FounderScore
from app.models.sources import Claim, ClaimContradiction, ClaimEvidenceLink, Evidence
from app.models.workflow import (
    Debate,
    DebateArgument,
    DiligenceQuestion,
    DiligenceResponse,
    HumanDecision,
    InvestmentMemo,
    RecommendedAction,
    RefereeDecision,
    WorkflowEvent,
)

DEMO_FUND_NAME = "Northstar Ventures (Demo)"


def clear_demo(keep_company: str | None = "Inferra") -> dict:
    init_db()
    db = SessionLocal()
    try:
        # what to KEEP
        keep_company_row = db.scalar(
            select(Company).where(Company.name == keep_company, Company.is_demo == True)  # noqa: E712
        ) if keep_company else None
        keep_company_id = keep_company_row.id if keep_company_row else None
        keep_founder_ids: set[int] = set()
        keep_opp_ids: set[int] = set()
        if keep_company_id:
            keep_founder_ids = set(db.scalars(
                select(FounderCompanyRelationship.founder_id).where(
                    FounderCompanyRelationship.company_id == keep_company_id)
            ))
            keep_opp_ids = set(db.scalars(
                select(Opportunity.id).where(Opportunity.company_id == keep_company_id)))

        # demo entities to DELETE (everything demo that we're not keeping)
        del_founder_ids = [i for i in db.scalars(select(Founder.id).where(Founder.is_demo == True))  # noqa: E712
                           if i not in keep_founder_ids]
        del_company_ids = [i for i in db.scalars(select(Company.id).where(Company.is_demo == True))  # noqa: E712
                           if i != keep_company_id]
        del_opp_ids = [i for i in db.scalars(select(Opportunity.id).where(Opportunity.is_demo == True))  # noqa: E712
                       if i not in keep_opp_ids]

        del_claim_ids = list(db.scalars(select(Claim.id).where(
            Claim.is_demo == True,  # noqa: E712
            (Claim.founder_id.in_(del_founder_ids) | Claim.company_id.in_(del_company_ids)),
        ))) if (del_founder_ids or del_company_ids) else []
        del_assess_ids = list(db.scalars(select(OpportunityAssessment.id).where(
            OpportunityAssessment.opportunity_id.in_(del_opp_ids)))) if del_opp_ids else []
        del_debate_ids = list(db.scalars(select(Debate.id).where(
            Debate.opportunity_id.in_(del_opp_ids)))) if del_opp_ids else []
        del_dq_ids = list(db.scalars(select(DiligenceQuestion.id).where(
            DiligenceQuestion.opportunity_id.in_(del_opp_ids)))) if del_opp_ids else []

        d = db.execute
        # opportunity children
        if del_assess_ids:
            d(delete(AxisAssessment).where(AxisAssessment.assessment_id.in_(del_assess_ids)))
        if del_opp_ids:
            d(delete(OpportunityAssessment).where(OpportunityAssessment.opportunity_id.in_(del_opp_ids)))
        if del_debate_ids:
            d(delete(DebateArgument).where(DebateArgument.debate_id.in_(del_debate_ids)))
            d(delete(RefereeDecision).where(RefereeDecision.debate_id.in_(del_debate_ids)))
        if del_dq_ids:
            d(delete(DiligenceResponse).where(DiligenceResponse.question_id.in_(del_dq_ids)))
        if del_opp_ids:
            d(delete(Debate).where(Debate.opportunity_id.in_(del_opp_ids)))
            d(delete(InvestmentMemo).where(InvestmentMemo.opportunity_id.in_(del_opp_ids)))
            d(delete(DiligenceQuestion).where(DiligenceQuestion.opportunity_id.in_(del_opp_ids)))
            d(delete(RecommendedAction).where(RecommendedAction.opportunity_id.in_(del_opp_ids)))
            d(delete(HumanDecision).where(HumanDecision.opportunity_id.in_(del_opp_ids)))
            d(delete(WorkflowEvent).where(WorkflowEvent.opportunity_id.in_(del_opp_ids)))
            d(delete(Opportunity).where(Opportunity.id.in_(del_opp_ids)))

        # claims / contradictions
        if del_claim_ids:
            d(delete(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id.in_(del_claim_ids)))
            d(delete(ClaimContradiction).where(
                ClaimContradiction.claim_a_id.in_(del_claim_ids) | ClaimContradiction.claim_b_id.in_(del_claim_ids)))
            d(delete(Claim).where(Claim.id.in_(del_claim_ids)))

        # founder / company data
        if del_founder_ids or del_company_ids:
            d(delete(Evidence).where(
                Evidence.founder_id.in_(del_founder_ids) | Evidence.company_id.in_(del_company_ids)))
        if del_founder_ids:
            d(delete(FounderScore).where(FounderScore.founder_id.in_(del_founder_ids)))
            d(delete(FounderMomentumSnapshot).where(FounderMomentumSnapshot.founder_id.in_(del_founder_ids)))
            d(delete(FounderCompanyRelationship).where(FounderCompanyRelationship.founder_id.in_(del_founder_ids)))
        if keep_company is None:
            d(delete(Application).where(Application.is_demo == True))  # noqa: E712
        if del_company_ids:
            d(delete(Application).where(Application.company_id.in_(del_company_ids)))
            d(delete(Company).where(Company.id.in_(del_company_ids)))
        if del_founder_ids:
            d(delete(Founder).where(Founder.id.in_(del_founder_ids)))

        removed_thesis = renamed_fund = False
        if keep_company is None:
            # The demo thesis goes only while it is still the untouched demo one.
            demo_theses = db.scalars(
                select(InvestmentThesis).where(InvestmentThesis.fund_name == DEMO_FUND_NAME)).all()
            for t in demo_theses:
                db.delete(t)
            removed_thesis = bool(demo_theses)
            for f in db.scalars(select(Fund).where(Fund.name == DEMO_FUND_NAME)).all():
                f.name = "My fund"
                renamed_fund = True

        db.commit()
        return {
            "kept_company": keep_company if keep_company_id else None,
            "removed_demo_founders": len(del_founder_ids),
            "removed_demo_opportunities": len(del_opp_ids),
            "removed_demo_thesis": removed_thesis,
            "renamed_demo_fund": renamed_fund,
            "founders_remaining": db.query(Founder).count(),
            "note": "Run `python -m app.seed.seed --force` to restore the full demo.",
        }
    finally:
        db.close()


if __name__ == "__main__":
    if "--all" in sys.argv[1:]:
        print("Cleared demo:", clear_demo(keep_company=None))
    else:
        print("Cleared demo:", clear_demo())
