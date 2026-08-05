"""Fictional demo data definitions. Clearly labeled as demo; never real people."""

from __future__ import annotations

from typing import Any

# 8 fictional founders + companies.
# github_username values are intentionally fictional-looking; the seed marks all
# of this as demo and does NOT hit the live GitHub API.

FOUNDERS: list[dict[str, Any]] = [
    {
        "full_name": "Ada Meridian", "github_username": "ada-meridian-demo",
        "location": "Boston, MA", "headline": "Ex-infra eng, building payments rails",
        "education": [{"school": "MIT", "degree": "BS CS", "is_elite": True}],
        "work_history": [{"company": "Stripe", "role": "Staff Eng", "is_famous": True}],
        "accelerators": [{"name": "Y Combinator", "is_elite": True}],
        "prior_funding": [],
        "evidence_strength": "high",
    },
    {
        "full_name": "Bruno Castellano", "github_username": "bcastellano-demo",
        "location": "Boston, MA", "headline": "Self-taught, shipping fintech APIs",
        "education": [{"school": "Community college", "degree": "AA", "is_elite": False}],
        "work_history": [{"company": "Regional bank", "role": "Backend Eng", "is_famous": False}],
        "accelerators": [],
        "prior_funding": [],
        "evidence_strength": "high",
    },
    {
        "full_name": "Chandra Okafor", "github_username": "chandra-okafor-demo",
        "location": "San Francisco, CA", "headline": "ML researcher turned founder",
        "education": [{"school": "Stanford", "degree": "PhD ML", "is_elite": True}],
        "work_history": [{"company": "Google", "role": "Research Scientist", "is_famous": True}],
        "accelerators": [],
        "prior_funding": [{"round": "angel", "amount": 250000, "investor": "network angels"}],
        "evidence_strength": "medium",
    },
    {
        "full_name": "Dae-Jung Park", "github_username": "daejung-park-demo",
        "location": "Austin, TX", "headline": "Climate data infrastructure",
        "education": [{"school": "UT Austin", "degree": "BS", "is_elite": False}],
        "work_history": [{"company": "Climate startup", "role": "Founder", "is_famous": False}],
        "accelerators": [{"name": "Techstars", "is_elite": False}],
        "prior_funding": [],
        "evidence_strength": "medium",
    },
    {
        "full_name": "Elena Vasquez", "github_username": "elena-vasquez-demo",
        "location": "New York, NY", "headline": "Healthcare workflow automation",
        "education": [{"school": "Harvard", "degree": "MBA", "is_elite": True}],
        "work_history": [{"company": "McKinsey", "role": "Consultant", "is_famous": True}],
        "accelerators": [],
        "prior_funding": [],
        "evidence_strength": "low",
    },
    {
        "full_name": "Farid Nasser", "github_username": "farid-nasser-demo",
        "location": "Remote", "headline": "Open-source dev tools maintainer",
        "education": [{"school": "State university", "degree": "BS CS", "is_elite": False}],
        "work_history": [{"company": "Freelance", "role": "Engineer", "is_famous": False}],
        "accelerators": [],
        "prior_funding": [],
        "evidence_strength": "high",
    },
    {
        "full_name": "Grace Lindqvist", "github_username": "grace-lindqvist-demo",
        "location": "London, UK", "headline": "Security tooling for supply chains",
        "education": [{"school": "Imperial College", "degree": "MEng", "is_elite": True}],
        "work_history": [{"company": "Palantir", "role": "FDE", "is_famous": True}],
        "accelerators": [{"name": "Entrepreneur First", "is_elite": True}],
        "prior_funding": [],
        "evidence_strength": "medium",
    },
    {
        "full_name": "Hassan Bello", "github_username": "hassan-bello-demo",
        "location": "Boston, MA", "headline": "Data infra for small banks",
        "education": [{"school": "Northeastern", "degree": "BS", "is_elite": False}],
        "work_history": [{"company": "Fintech startup", "role": "Eng #3", "is_famous": False}],
        "accelerators": [],
        "prior_funding": [],
        "evidence_strength": "low",
    },
]

COMPANIES: list[dict[str, Any]] = [
    {"name": "LedgerLoop", "sector": "fintech", "stage": "pre-seed", "geography": "Boston",
     "business_model": "b2b saas", "one_liner": "Reconciliation infrastructure for fintechs",
     "github_org": "ledgerloop-demo"},
    {"name": "PayMesh", "sector": "fintech", "stage": "pre-seed", "geography": "Boston",
     "business_model": "api", "one_liner": "Programmable payments API for marketplaces",
     "github_org": "paymesh-demo"},
    {"name": "Inferra", "sector": "ai/ml", "stage": "seed", "geography": "San Francisco",
     "business_model": "b2b saas", "one_liner": "Retrieval infrastructure for enterprise LLMs",
     "github_org": "inferra-demo"},
    {"name": "TerraSignal", "sector": "climate", "stage": "pre-seed", "geography": "Austin",
     "business_model": "data", "one_liner": "Carbon-data pipelines for supply chains",
     "github_org": "terrasignal-demo"},
    {"name": "CareBridge", "sector": "healthcare", "stage": "seed", "geography": "New York",
     "business_model": "b2b saas", "one_liner": "Prior-authorization automation for clinics",
     "github_org": None},
    {"name": "ForgeTools", "sector": "devtools", "stage": "pre-seed", "geography": "Remote",
     "business_model": "open core", "one_liner": "CI cache & build acceleration",
     "github_org": "forgetools-demo"},
    {"name": "ChainWarden", "sector": "security", "stage": "seed", "geography": "London",
     "business_model": "b2b saas", "one_liner": "Software supply-chain attestation",
     "github_org": "chainwarden-demo"},
    {"name": "CoreVault", "sector": "fintech", "stage": "pre-seed", "geography": "Boston",
     "business_model": "b2b saas", "one_liner": "Core banking data layer for community banks",
     "github_org": None},
]
