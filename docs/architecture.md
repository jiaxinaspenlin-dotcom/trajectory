# Trajectory — System Architecture

Trajectory is an AI venture-capital intelligence platform. It runs a single
opportunity workflow — **Sourcing → Screening → Diligence → Decision** — into
which both outbound prospects (surfaced from public signals) and inbound
applications converge. The VC fund is the client; **humans approve every
consequential action**. The system never invents facts and never performs
automatic outreach or investment.

---

## 1. High-level stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend API | FastAPI (`app/main.py`), Python 3.12+ | Title "Trajectory API", version 0.1.0 |
| ORM | SQLAlchemy 2 (typed `Mapped[...]` models) | `app/models/` |
| Migrations | Alembic | Postgres uses migrations; SQLite dev auto-creates tables at startup |
| Database | SQLite (dev, zero-config fallback) / Postgres (prod, docker-compose) | `settings.resolved_database_url` |
| AI provider | OpenAI (Chat Completions, JSON mode) via official SDK (`app/ai/provider.py`) | Abstracted; required for AI features — raises HTTP 503 when no key (no fake fallback) |
| Connectors | Live GitHub REST v3 (`app/connectors/github.py`) | Others declared but not implemented |
| Frontend | Next.js 14 (App Router), React 18, TypeScript | `frontend/` — two personas (`/vc`, `/founder`) behind a landing chooser. An `AuthGate` component + `/api/auth/*` backend exist, but login is currently disabled (the layouts render without gating) |
| Styling | Tailwind CSS 3 | custom design tokens (ink/surface/brand) |
| Charts | Recharts 2 | momentum trajectory chart |
| Frontend tests | Vitest 2 + Testing Library + jsdom | `npm run test` |

### Configuration & degradation behavior

All configuration is environment-based (`app/core/config.py`, pydantic-settings).
No secret is hardcoded. Optional integrations degrade rather than fail:

- No `OPENAI_API_KEY` → AI services raise `AIError` → AI endpoints return HTTP
  503 (no fake fallback). The deterministic scoring engines and the static
  seeded demo remain fully functional.
- No `DATABASE_URL` → local SQLite file (`backend/trajectory.db`).
- No `GITHUB_TOKEN` → anonymous GitHub API (60 requests/hour).

---

## 2. Backend request flow

```
                 ┌──────────────────── Investment Thesis (per-fund, configurable) ────────────────────┐
                 │  Every sourcing result, score, ranking & recommendation is evaluated through it.    │
                 └────────────────────────────────────────────────────────────────────────────────────┘

  OUTBOUND                                     INBOUND
  ────────                                     ───────
  GitHub sync (live connector)                 Application (company name + pitch deck)
  POST /api/sourcing/github/sync               POST /api/applications  +  /upload-deck
        │                                             │
        ▼                                             ▼
  Normalized Evidence (independent)            Founder-reported Evidence + parsed deck facts
        │                                             │
        └──────────────► ONE Opportunity object ◄─────┘
                         (entry_type = outbound | inbound)

        Sourcing ──► Screening ──► Diligence ──► Decision  (WorkflowStage)
                         │             │            │
             three independent    Bull/Bear/    Memo + Recommended
             axes + Founder       Referee       Action → HUMAN
             Score + momentum     debate         decision (separate record)
```

The analysis pipeline is driven by `POST /api/opportunities/{id}/analyze`
(rate-limited). It computes the deterministic Founder Score, three-axis
screening, diligence questions, the Arena debate, and the memo — each stored as
a **new version**, never overwritten.

### API surface (route modules under `app/api/`)

| Module | Prefix | Representative endpoints |
|--------|--------|--------------------------|
| `routes_auth` | `/api/auth` | `POST /signup`, `POST /login`, `GET /me`, `POST /logout` (DB-persisted accounts + opaque session tokens; backs the — currently disabled — login for the two frontend personas) |
| `routes_meta` | `/api` | `GET /health`, `GET /connectors/status`, `GET /settings`, `GET/PUT /tour` |
| `routes_thesis` | `/api/thesis` | `GET`, `GET /list`, `POST`, `PUT /{id}` (creating a new active thesis deactivates the prior one — history kept) |
| `routes_entities` | `/api` | `GET /founders`, `/founders/{id}`, `/founders/{id}/score`, `POST /founders/{id}/score/recompute`, `GET /founders/{id}/score/history`, `/founders/{id}/momentum`, `/companies`, `/evidence`, `/claims`, `/contradictions` |
| `routes_applications` | `/api/applications` | `POST` (create inbound), `POST /{id}/upload-deck`, `GET /{id}`, `GET` |
| `routes_opportunities` | `/api` | `GET /opportunities`, `/opportunities/{id}`, `POST .../analyze`, `.../assessment`, `.../diligence`, `.../arena`, `.../memo`, `POST .../decision`, `GET /ranking`, `/ranking/prestige-audit`, `/ranking/prestige-sensitivity`, `POST .../validate-evidence-refs` |
| `routes_sourcing` | `/api` | `POST /sourcing/github/sync`, `POST /search/parse`, `POST /search/apply`, `GET /sourcing/prospects`, `POST /sourcing/prospects/{id}/action`, `GET /dashboard` |

CORS is restricted to configured origins (default `http://localhost:3000`).
AI-invoking endpoints (`/analyze`, `/assessment`, `/diligence`, `/arena`,
`/memo`, `/sourcing/github/sync`, `/search/parse`) carry the
`ai_rate_limit` dependency.

---

## 3. Connector layer

`app/connectors/base.py` defines a clean interface (`Connector`,
`NormalizedEvidence`, `ConnectorResult`) so future integrations can be added
without rewriting the app.

- **GitHub (live)** — `GitHubConnector.is_live = True`. Collects only public
  data (profile, repos, releases, contributors) and normalizes each into
  `NormalizedEvidence` marked `provenance=independent`,
  `verification_status=verified`. GitHub stars/followers are captured but
  explicitly labeled "external interest, NOT commercial traction".
- **Planned but unavailable** — hackathons, product launches, papers, patents,
  accelerator cohorts, social signals. Each is served by
  `UnavailableConnector`, which reports
  `status: "not_implemented"`. The app never claims an unimplemented connector
  is live.

Restricted platforms (LinkedIn, X) are never scraped.

---

## 4. AI provider layer (no fallback → 503)

`app/ai/provider.py` exposes a single dependency: `AIProvider.generate_json()`.
The rest of the codebase depends only on that method, so a second provider
could be added without rewriting callers. The sole implemented provider is
OpenAI (Chat Completions, JSON mode — `response_format={"type":
"json_object"}`), with `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-4o`)
read from config. Key properties:

- API key loaded from env, never logged, never sent to the client. Calls run on
  the backend only.
- Explicit timeouts (`AI_TIMEOUT_SECONDS`, default 60s) and retries (no
  SDK-level retries; retries handled in-app with exponential backoff).
- A hard guard appended to every system prompt: return a single JSON object, no
  markdown/prose, **no step-by-step reasoning** (no hidden chain-of-thought),
  never invent facts/citations/URLs/metrics/evidence IDs.
- **No AI fallback.** If no `OPENAI_API_KEY` is set, or a call fails after
  retries, `generate_json` raises `AIError`; each AI service in
  `app/ai/services.py` lets it propagate, and a global exception handler in
  `app/main.py` turns it into an HTTP **503** JSON response (`ai_unavailable:
  true`, plus a hint to set `OPENAI_API_KEY`). Real AI output carries
  `generated_by: "openai"`. The deterministic scoring engines in
  `app/scoring/` are a separate pure-Python core that is unaffected by a missing
  key, and the seed writes static demo fixtures (`generated_by="demo"`) so the
  demo stays browsable without AI.
- Output is validated (`app/ai/validation.py`): evidence IDs the model cites
  are checked against the IDs actually provided; unknown IDs are rejected/flagged.

---

## 5. Data model overview — the 32 tables

Grouped by domain (`app/models/__init__.py` aggregates all so
`Base.metadata` sees every table).

### Auth (2)
`AuthAccount` (email + role + display name; salted PBKDF2 password hash — never
plaintext), `AuthSession` (opaque session token stored only as a SHA-256 hash,
with an expiry). Separate from the domain `User`/`Fund` models; a single email
may hold at most one account per role, so one person can be both an investor and
a founder.

### Core / account (3)
`User`, `Fund`, `InvestmentThesis` — the thesis is fully configurable per fund
(sectors, stages, geographies, check sizes, exclusions, custom scoring
criteria, and overridable Founder Score `score_weights`).

### Entities (5)
`Founder` (persistent identity; prestige attributes stored here for masking),
`Company`, `FounderCompanyRelationship`, `Application` (inbound; minimum inputs
= company name + pitch deck), `UploadedDocument` (deck stored outside the
public static dir with a sanitized, random name).

### Memory / sources (6)
`DataSource`, `ConnectorSync` (captures rate-limit/error state per sync),
`Evidence` (normalized, timestamped, attributed, with provenance & confidence),
`Claim` (discrete factual claim with a per-claim Trust Score),
`ClaimEvidenceLink` (supports|contradicts), `ClaimContradiction`.

### Scoring (2)
`FounderScore` (versioned; never overwritten), `FounderMomentumSnapshot`
(point-in-time series that forms the trajectory chart).

### Opportunity & assessment (4)
`Opportunity` (the convergence point; carries `entry_type`, `stage`, `status`,
`first_signal_at`/`recommendation_at` for first-signal→recommendation timing,
`thesis_fit_score`),
`OpportunityAssessment` (versioned screening pass), `AxisAssessment` (one of the
three independent axes — never averaged), `PrestigeAudit`.

### Workflow / decision (10)
`DiligenceQuestion`, `DiligenceResponse`, `Debate` (versioned Arena),
`DebateArgument` (bull|bear), `RefereeDecision`, `InvestmentMemo` (versioned),
`RecommendedAction` (never auto-executed; superseded, not deleted),
`HumanDecision` (recorded **separately** from the system recommendation),
`WorkflowEvent` (audit trail), `TourProgress`.

---

## 6. How history is preserved

Nothing consequential is overwritten:

- **Founder Scores** carry a `version` and are appended
  (`GET /founders/{id}/score/history` returns the full series).
- **Momentum snapshots** are point-in-time rows; the series drives the chart.
- **Assessments, Debates, Memos** carry a `version`; regeneration writes a new
  row and the API returns the latest by `version desc`.
- **Theses** — creating a new active thesis deactivates the previous one rather
  than deleting it.
- **Recommendations** are marked `superseded=True` rather than removed.
- **Human decisions** are stored separately from the system recommendation, and
  every state change is logged to `WorkflowEvent`.

This makes every score and recommendation explainable and auditable over time.
