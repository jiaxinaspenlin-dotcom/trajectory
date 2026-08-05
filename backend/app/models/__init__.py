"""Aggregate model imports so `Base.metadata` sees every table."""

from app.models.assessment import (
    AxisAssessment,
    Opportunity,
    OpportunityAssessment,
)
from app.models.auth import AuthAccount, AuthSession
from app.models.core import Fund, InvestmentThesis, User
from app.models.entities import (
    Application,
    Company,
    Founder,
    FounderCompanyRelationship,
    UploadedDocument,
)
from app.models.scoring import FounderMomentumSnapshot, FounderScore
from app.models.sources import (
    Claim,
    ClaimContradiction,
    ClaimEvidenceLink,
    ConnectorSync,
    DataSource,
    Evidence,
)
from app.models.workflow import (
    Debate,
    DebateArgument,
    DiligenceQuestion,
    DiligenceResponse,
    HumanDecision,
    InvestmentMemo,
    RecommendedAction,
    RefereeDecision,
    TourProgress,
    WorkflowEvent,
)

__all__ = [
    "AuthAccount", "AuthSession",
    "User", "Fund", "InvestmentThesis",
    "Founder", "Company", "FounderCompanyRelationship", "Application", "UploadedDocument",
    "DataSource", "ConnectorSync", "Evidence", "Claim", "ClaimEvidenceLink", "ClaimContradiction",
    "FounderScore", "FounderMomentumSnapshot",
    "Opportunity", "OpportunityAssessment", "AxisAssessment",
    "DiligenceQuestion", "DiligenceResponse", "Debate", "DebateArgument", "RefereeDecision",
    "InvestmentMemo", "RecommendedAction", "HumanDecision", "WorkflowEvent", "TourProgress",
]
