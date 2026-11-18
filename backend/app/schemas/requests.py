"""Pydantic request bodies for the REST API."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Lightweight email check — avoids pulling in the email-validator dependency.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(min_length=1, max_length=255)
    role: Literal["investor", "founder"]

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address.")
        return v


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)
    role: Literal["investor", "founder"]

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class ThesisIn(BaseModel):
    fund_name: str = Field(min_length=1, max_length=255)
    sectors: list[str] = []
    stages: list[str] = []
    geographies: list[str] = []
    min_check_size: float = 0.0
    max_check_size: float = 0.0
    target_ownership: float = 0.0
    risk_tolerance: str = "balanced"
    traction_preferences: str = ""
    founder_preferences: str = ""
    excluded_sectors: list[str] = []
    excluded_geographies: list[str] = []
    excluded_business_models: list[str] = []
    custom_description: str = ""
    custom_scoring_criteria: list[dict] = []
    score_weights: dict = {}


class ApplicationIn(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)
    founder_names: list[str] = []
    email: str | None = None
    website: str | None = None
    github_profile: str | None = None
    github_org: str | None = None
    product_link: str | None = None
    demo_link: str | None = None
    sector: str | None = None
    geography: str | None = None
    funding_requested: float | None = None
    use_of_funds: str | None = None
    current_revenue: float | None = None
    num_users: int | None = None
    customer_info: str | None = None
    prior_funding: str | None = None
    accelerator_history: str | None = None
    team_info: str | None = None
    founder_notes: str | None = None


class ApplicationUpdateIn(BaseModel):
    """Founder provides additional info the fund requested (all optional)."""

    website: str | None = None
    product_link: str | None = None
    demo_link: str | None = None
    github_profile: str | None = None
    github_org: str | None = None
    sector: str | None = None
    geography: str | None = None
    funding_requested: float | None = None
    use_of_funds: str | None = None
    current_revenue: float | None = None
    num_users: int | None = None
    customer_info: str | None = None
    prior_funding: str | None = None
    accelerator_history: str | None = None
    team_info: str | None = None
    founder_notes: str | None = None


class GitHubSyncIn(BaseModel):
    founder_id: int | None = None
    username: str | None = None
    org: str | None = None
    repo_url: str | None = None
    # optional: create a founder if none given
    create_founder_name: str | None = None


class SearchIn(BaseModel):
    query: str = Field(min_length=1, max_length=1000)


class DiscoverIn(BaseModel):
    brief: str = Field(default="", max_length=1000)
    limit: int = Field(default=8, ge=1, le=15)


class WebSearchIn(BaseModel):
    request: str = Field(min_length=3, max_length=1000)


class WebSaveIn(BaseModel):
    status: Literal["saved", "monitoring"] = "saved"


class SearchApplyIn(BaseModel):
    filters: dict


class ProspectActionIn(BaseModel):
    action: str  # save | dismiss | monitor | clear_shortlist | recommend_outreach | invite_to_apply


class DiligenceStatusIn(BaseModel):
    status: str


class DiligenceResponseIn(BaseModel):
    answer: str
    answered_by: str = "founder"
    evidence_ids: list[int] = []


class HumanDecisionIn(BaseModel):
    # every field is an explicit choice; nothing defaults to an outcome
    decided_by: str = Field(min_length=1, max_length=255)
    decision: str  # approved | rejected | deferred | overridden
    chosen_action: str = Field(min_length=1, max_length=64)
    notes: str = ""


class TourProgressIn(BaseModel):
    user_id: int | None = None
    completed: bool = False
    last_step: int = 0
    skipped: bool = False


class NarrativeFounderIn(BaseModel):
    """Create an outbound prospect from a GitHub username directly."""

    github_username: str
    full_name: str | None = None
