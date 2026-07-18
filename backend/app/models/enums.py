"""Enumerations used across Trajectory models and schemas."""

from __future__ import annotations

from enum import StrEnum


class WorkflowStage(StrEnum):
    SOURCING = "sourcing"
    SCREENING = "screening"
    DILIGENCE = "diligence"
    DECISION = "decision"


class OpportunityStatus(StrEnum):
    PROSPECT = "prospect"          # outbound, not yet contacted
    SAVED = "saved"
    MONITORING = "monitoring"
    DISMISSED = "dismissed"
    APPLIED = "applied"            # inbound application received
    IN_DILIGENCE = "in_diligence"
    DECIDED = "decided"


class EntryType(StrEnum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class SourceType(StrEnum):
    FOUNDER_SUBMITTED = "founder_submitted"
    PITCH_DECK = "pitch_deck"
    GITHUB_PROFILE = "github_profile"
    GITHUB_ORG = "github_org"
    GITHUB_REPO = "github_repo"
    COMPANY_WEBSITE = "company_website"
    PRODUCT_INFO = "product_info"
    # future connectors (declared but NOT implemented / not live):
    HACKATHON = "hackathon"
    PRODUCT_LAUNCH = "product_launch"
    PAPER = "paper"
    PATENT = "patent"
    ACCELERATOR = "accelerator"
    SOCIAL_SIGNAL = "social_signal"
    DEMO = "demo"


class VerificationStatus(StrEnum):
    VERIFIED = "verified"
    PARTIALLY_VERIFIED = "partially_verified"
    FOUNDER_REPORTED = "founder_reported"
    CONTRADICTED = "contradicted"
    UNVERIFIED = "unverified"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


class Provenance(StrEnum):
    FOUNDER_REPORTED = "founder_reported"
    INDEPENDENT = "independent"


class AssessmentLabel(StrEnum):
    STRONG = "Strong"
    PROMISING = "Promising"
    MIXED = "Mixed"
    WEAK = "Weak"
    INSUFFICIENT_EVIDENCE = "Insufficient Evidence"


class AxisKind(StrEnum):
    FOUNDER = "founder"
    MARKET = "market"
    IDEA_VS_MARKET = "idea_vs_market"


class TrajectoryLabel(StrEnum):
    ACCELERATING = "accelerating"
    IMPROVING = "improving"
    STABLE = "stable"
    DECLINING = "declining"
    INSUFFICIENT_HISTORY = "insufficient_history"


class DebateRole(StrEnum):
    BULL = "bull"
    BEAR = "bear"
    REFEREE = "referee"


class RecommendedActionType(StrEnum):
    INVITE_TO_APPLY = "Invite to Apply"
    SCHEDULE_INTERVIEW = "Schedule Interview"
    REQUEST_INFORMATION = "Request Information"
    CONTINUE_DILIGENCE = "Continue Diligence"
    MONITOR = "Monitor"
    INVEST = "Invest"
    PASS = "Pass"


class DiligenceStatus(StrEnum):
    OPEN = "open"
    REQUESTED = "requested"
    ANSWERED = "answered"
    VERIFIED = "verified"
    UNRESOLVED = "unresolved"
    NOT_APPLICABLE = "not_applicable"


class SyncStatus(StrEnum):
    SUCCESS = "success"
    PARTIAL = "partial"
    RATE_LIMITED = "rate_limited"
    NOT_FOUND = "not_found"
    ERROR = "error"


class HumanDecisionType(StrEnum):
    APPROVED = "approved"
    REJECTED = "rejected"
    DEFERRED = "deferred"
    OVERRIDDEN = "overridden"
