# Trajectory — AI Venture-Capital Operating System

Trajectory is an AI-powered operating system for venture capital that takes a fund from
**Sourcing → Screening → Diligence → Decision**. The **fund is the client**. Trajectory helps it
define a thesis, discover promising founders before they fundraise, accept inbound applications,
organize evidence, evaluate opportunities, surface contradictions and missing information, produce
an evidence-backed investment memo, and recommend an actionable next step —
while **a human approves every consequential action**.

> This is a demonstration product. No real fund uses Trajectory today, and all demo data is
> fictional and clearly labeled. Real public GitHub data can be synced live and is stored
> separately from demo data — the two are never silently mixed.

---

## Table of contents
- [Highlights](#highlights)
- [The three differentiators](#the-three-differentiators)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick start (local, no Docker)](#quick-start-local-no-docker)
- [Quick start (Docker)](#quick-start-docker)
- [Environment variables](#environment-variables)
- [OpenAI setup](#openai-setup)
- [GitHub setup](#github-setup)
- [Web search setup](#web-search-setup)
- [Database, migrations, seed](#database-migrations-seed)
- [Running tests, lint, type-checks, builds](#running-tests-lint-type-checks-builds)
- [API overview](#api-overview)
- [Product pages](#product-pages)
- [Project layout](#project-layout)
- [Known limitations](#known-limitations)
- [Further documentation](#further-documentation)

---

## Highlights

- **Configurable Thesis Engine** — per-fund thesis (sectors, stages, geographies, check sizes,
  exclusions, custom scoring weights). Every score, ranking and recommendation is evaluated
  *through the active thesis*. Nothing is hardcoded to one fund.
- **Memory / Evidence layer** — collects, normalizes, deduplicates, timestamps and attributes data
  from multiple sources. Each evidence item stores source, type, URL, collection + event dates,
  provenance (founder-reported vs independent), verification status and confidence.
- **Live GitHub connector** — the official GitHub REST API, with caching, rate-limit handling,
  retries, and handling of missing/deleted/incomplete data. Other connectors
  (hackathons, papers, patents, …) are *declared but reported as not implemented*.
- **Deterministic Founder Score** — a persistent, per-person score computed in **pure Python**
  (the LLM never invents it), fully explained by component, weight, value, evidence count,
  confidence, missingness and contribution. Versioned — never silently reset.
- **Three independent screening axes** — Founder, Market, Idea-vs-Market are assessed separately
  and **never averaged**. Disagreement is preserved.
- **Claim-level Trust Scores** — every important claim links to stored evidence with a per-claim
  Trust Score, verification status, and supporting/contradictory evidence IDs.
- **Diligence & contradiction checking** — rule-based numeric contradiction detection plus
  generated, trackable diligence questions. A validation layer **rejects AI references to
  nonexistent evidence IDs**.
- **Evidence-backed memo** — a structured investment memo that always renders the full standard
  section set (Company Snapshot, Investment Hypotheses, SWOT, Team & History, Problem & Product,
  Technology & Defensibility, Market Sizing, Competition, Traction & KPIs, Financials & Round
  Structure, Cap Table, Due Diligence Log, Exit Perspective), labeling anything *Not disclosed /
  Not verified / Insufficient evidence* rather than inventing content. It drops down inline inside
  the Investment Arena on a prospect's profile.
- **Prioritized Action Queue** — a single ranked "what to do next, and on whom" list for the
  investor (replacing per-deal countdown timers). First-signal → decision timestamps are retained
  on each opportunity.
- **Two personas** — a landing chooser routes to a `/vc` investor workspace or a `/founder`
  portal. A full account system (signup/login, hashed passwords, DB-persisted sessions) is
  implemented and available at `/api/auth/*`, but the **login screens are currently disabled**, so
  both workspaces open directly. Re-enable by wrapping the layouts in `AuthGate`.
- **Human oversight** — the system recommends; the human records a separate decision. No automatic
  outreach or investment ever happens.

## The differentiators

- **Founder Momentum** — measures the *direction and rate of change* of a founder's execution over
  time (contribution activity, releases, outside contributors, product iteration, …), labeling the
  trajectory `accelerating / improving / stable / declining / insufficient_history` and explaining
  *why* the score changed. GitHub **stars are never treated as commercial traction**.
- **Investment Arena** — original illustrated **Bull**, **Bear**, and a neutral human **Referee**.
  The Bull makes the strongest evidence-backed case to advance, the Bear the strongest case for
  caution, and the Referee judges **evidence quality and independence** (not persuasive writing) to
  recommend an actionable next step — citing real evidence. Hover, keyboard focus, click-to-pin, and
  mobile tap all work, with ARIA labels and reduced-motion support. The Referee also acts as a
  guided-tour host.

## Architecture

```
┌────────────────────┐        REST/JSON        ┌──────────────────────────────┐
│  Next.js 14 (TS)   │  ───────────────────►   │  FastAPI (Python 3.12)       │
│  Tailwind, Recharts│                         │  ├─ Thesis engine            │
│  Investment Arena  │  ◄───────────────────   │  ├─ Deterministic scoring    │
│  Guided tour       │                         │  │   (score/momentum/rank/   │
└────────────────────┘                         │  │    trust) — pure Python   │
                                               │  ├─ Connector layer (GitHub) │
                                               │  ├─ AI provider (OpenAI)     │
                                               │  │   required for AI features│
                                               │  └─ SQLAlchemy 2 + Alembic   │
                                               └───────────────┬──────────────┘
                                                               │
                                                   ┌───────────▼───────────┐
                                                   │ PostgreSQL (prod)      │
                                                   │ SQLite (dev/test)      │
                                                   └────────────────────────┘
```

- **Python owns** API integration, evidence processing, scoring, PDF processing, AI
  orchestration, data validation, and business logic.
- The **AI provider layer** is abstracted so another provider can be added without rewriting the app.
  The AI features require an `OPENAI_API_KEY`; without one those endpoints return HTTP 503 (no fake
  fallback). The deterministic engines (Founder Score, Momentum, ranking, Trust) never need a key.
- Inbound applications and outbound GitHub prospects **converge into the same `Opportunity`**
  workflow object.

See [docs/architecture.md](docs/architecture.md) for the full design and the 30-table data model.

## Prerequisites

- **Python 3.12+**
- **Node.js 20+** and npm
- **Docker** (optional, for the Postgres-backed full stack)
- No local Postgres required for local dev — Trajectory falls back to a bundled **SQLite** file.

## Quick start (local, no Docker)

```bash
# 0. from the repo root
cp .env.example .env            # fill in keys later; the app works without them

# 1. one-shot setup (creates venv, installs backend + frontend deps)
make setup

# 2. database: migrate + seed fictional demo data (SQLite by default)
make migrate
make seed

# 3. run the backend (http://localhost:8000, interactive docs at /docs)
make backend

# 4. in a second terminal, run the frontend (http://localhost:3000)
make frontend
```

Open **http://localhost:3000** and choose **I'm a VC** or **I'm a Founder** — both workspaces open
directly (login is currently disabled). The guided tour auto-starts the first time an investor
reaches the dashboard.

> Without `make`, run the equivalent commands shown in the Makefile — e.g.
> `cd backend && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt`,
> `./.venv/bin/alembic upgrade head`, `./.venv/bin/python -m app.seed.seed`,
> `./.venv/bin/uvicorn app.main:app --reload`.

## Quick start (Docker)

```bash
# Optional: export secrets so the containers pick them up (never commit them)
export OPENAI_API_KEY=sk-...                # enables AI features; omit and they return 503
export GITHUB_TOKEN=ghp_...                # optional — omit for anonymous 60/hr

docker compose up --build
# backend:  http://localhost:8000  (docs at /docs)
# frontend: http://localhost:3000
# postgres: localhost:5432 (trajectory/trajectory)
```

The backend container waits for Postgres, runs migrations, and seeds demo data if the DB is empty.

## Environment variables

Copy `.env.example` to `.env`. **Never commit `.env` or put real values in `.env.example`.**

| Variable | Purpose | Default / notes |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key (server-side only) | empty → AI features return 503 (no fallback) |
| `OPENAI_MODEL` | OpenAI model id | `gpt-4o` |
| `GITHUB_TOKEN` | Raises GitHub rate limit to 5000/hr | empty → anonymous 60/hr |
| `TAVILY_API_KEY` | Web search for Founders → Source founders → Web search (server-side only) | empty → web search shows setup instructions |
| `WEB_SEARCH_PROVIDER` | Web search provider | `tavily` (the only provider so far) |
| `DATABASE_URL` | SQLAlchemy URL | empty → SQLite file `backend/trajectory.db` |
| `BACKEND_CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:3000` |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend → backend base URL | `http://localhost:8000` |
| `MAX_UPLOAD_SIZE_MB` | Max pitch-deck upload size | `15` |
| `AI_RATE_LIMIT_PER_MINUTE` | Per-IP throttle on AI endpoints | `20` |
| `SECRET_KEY` | Internal signing seed | set your own in prod |
| `ENVIRONMENT` | `development` / `production` / `test` | `development` |

The OpenAI key is only ever read on the backend and is **never** included in the client bundle.
The `GET /api/settings` endpoint returns only a masked hint (last 4 chars) — never the full key.

## OpenAI setup

1. Get an API key from the OpenAI platform.
2. Put it in `.env` as `OPENAI_API_KEY=...` (and optionally set `OPENAI_MODEL`, default `gpt-4o`).
3. Restart the backend. `GET /api/health` will report `ai.enabled: true`.

**There is no fake fallback.** Without a key, the AI features (natural-language search parsing,
three-axis assessment, diligence questions, Bull/Bear/Referee, memo, pitch-deck interpretation) are
**unavailable** and their endpoints return HTTP 503 (`{"ai_unavailable": true}`). The frontend shows a
clear "AI not configured" message. The seeded demo ships with static, clearly-labeled demo
assessments/debates/memos so the app stays fully browsable without a key, and the deterministic
engines (Founder Score, Momentum, ranking, Trust) always work. The model is only ever given stored
evidence and is instructed never to invent facts; hallucinated evidence-ID references are rejected.

## GitHub setup

1. (Optional) Create a GitHub personal access token with **public** read scope.
2. Put it in `.env` as `GITHUB_TOKEN=...`.
3. From **Founders → + Source founders → GitHub profile**, enter a username and sync.

Only public data is collected, attributed to its source URL. Restricted platforms (LinkedIn, X)
are never scraped. Rate limits, missing profiles, deleted repos, and incomplete responses are
handled and reported by `GET /api/connectors/status`.

## Web search setup

1. Get a Tavily API key (app.tavily.com; keys start with `tvly-`).
2. Put it in `.env` as `TAVILY_API_KEY=...` (an `OPENAI_API_KEY` is also required — results are
   structured with AI) and restart the backend.
3. From **Founders → + Source founders → Web search**, describe what you're looking for or press
   **Start from fund thesis**, then **Search the web**.

How it works: the planner writes one open-web query plus one launch query per launch site (YC
Launches, Show HN, Product Hunt). The model turns the pages into results, and the backend keeps only
what the pages support: every claim cites a retrieved source, evidence quotes must appear in that
source, only company sites and single-product launch pages count as sources, unsupported dates are
shown as *Date unknown*, and founders named on a page stay *Unverified* unless a GitHub account that
lists the company's domain as its website confirms them. Nothing is saved until the investor saves a
result; leads are deduplicated on the company domain, a verified GitHub login, or the launch-page URL.
Later searches (or **Check the web for updates** on an opportunity) append only sources a lead doesn't
have yet and flag them as **New evidence** in Founders and on the Map. A search uses about 4 Tavily
credits, plus 1 per result whose company site has to be looked up (at most 5).

## Database, migrations, seed

- **Migrations (Alembic):** `cd backend && ./.venv/bin/alembic upgrade head`
- **Seed demo data:** `./.venv/bin/python -m app.seed.seed`
  (8 fictional founders + companies, multiple historical score/momentum snapshots, mixed-status
  claims, contradictions, three-axis assessments, diligence questions, ≥2 completed Arena debates,
  an inbound application, and completed memos — all flagged as demo).
- **Dev fallback:** if `DATABASE_URL` is unset the app uses SQLite and auto-creates tables on
  startup, so the app also runs without Alembic. Postgres uses migrations.

## Running tests, lint, type-checks, builds

```bash
# Backend — 42 pytest tests, ruff, mypy
cd backend
./.venv/bin/python -m pytest -q          # tests
./.venv/bin/ruff check app tests         # lint
./.venv/bin/mypy app                     # type-check

# Frontend — 13 Vitest tests + production build
cd frontend
npm run test                             # tests (vitest)
npx next build                           # production build (also type-checks)
```

Or simply `make test`, `make lint`, `make build`.

**Current status:** backend 42/42 tests pass, ruff clean, mypy clean (58 files);
frontend 13/13 tests pass.

## API overview

Interactive OpenAPI docs at **`/docs`** (schema at `/openapi.json`). 50+ documented endpoints, incl.:

- `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/health`, `GET /api/settings`, `GET /api/connectors/status`
- `GET/POST/PUT /api/thesis…`
- `GET /api/founders`, `/founders/{id}`, `/founders/{id}/score[/history]`, `/founders/{id}/momentum`
- `GET /api/companies…`, `/api/evidence…`, `/api/claims…`, `/api/contradictions`
- `POST /api/applications`, `POST /api/applications/{id}/upload-deck`
- `POST /api/sourcing/github/sync`, `GET /api/sourcing/prospects`, `POST …/action`
- `GET /api/sourcing/web/status`, `POST /api/sourcing/web/search`, `GET /api/sourcing/web/searches/{id}`,
  `POST /api/sourcing/web/searches/{id}/results/{key}/save`, `POST /api/sourcing/web/check/{opp_id}`,
  `POST /api/opportunities/{id}/evidence/reviewed`
- `POST /api/search/parse`, `POST /api/search/apply`
- `GET /api/opportunities…`, `POST …/analyze | assessment | diligence | arena | memo`
- `GET …/workflow`, `POST …/decision`, `POST …/validate-evidence-refs`
- `GET/PUT /api/tour`, `GET /api/dashboard`

## Product pages

Two personas behind a landing chooser (login is currently disabled, so both open directly).

- `/` landing (primary action: open the investor workspace; secondary: apply as a founder)
- **Investor workspace** (`/vc/*`, left navigation rail; menu button on phones):
  `/vc/map` canvas-first 3D map with two modes on one Three.js scene — **Relationships** (sector /
  project clusters, named links) and **Custom Axes** (Thesis fit × 30-day momentum × an optional
  third metric, real values only); state lives in the URL (`?view=axes&focus=<id>&x=&y=&z=`) ·
  `/vc` dashboard (stage overview + next actions + guided tour) ·
  `/vc/founders` sortable founder table (with a **New evidence** flag) and a **Source founders**
  drawer (Web search, GitHub discovery, GitHub profile sync; `/vc/discovery` opens it) · `/vc/pipeline` active deals by stage and source ·
  `/vc/fund` fund profile and thesis editor (`/vc/thesis` redirects here) ·
  `/vc/opportunities/[id]` opportunity (Founder Score, momentum,
  three axes with per-axis trend, claims/trust, the Investment Arena with an inline memo drawer and
  a full-screen debate player, pipeline Save/Monitor/Dismiss, human decision) ·
  `/vc/opportunities/[id]/diligence` diligence workspace · `/vc/opportunities/[id]/memo` print/PDF memo.
- **Founder portal** (`/founder/*`): `/founder` apply (company name + PDF deck) ·
  `/founder/applications` my applications · `/founder/application/[id]` status, first-pass screen,
  and the "what the fund still needs" form.

(The old single-interface `/dashboard`, `/apply`, `/settings` routes were replaced by the persona split.)

## Project layout

```
Trajectory/
├── backend/                 FastAPI app
│   ├── app/
│   │   ├── ai/              provider + services + validation (OpenAI; 503 when no key)
│   │   ├── api/             REST routers
│   │   ├── connectors/      GitHub (live) + connector interfaces
│   │   ├── core/            config, security (SSRF), passwords (auth hashing), rate limiting
│   │   ├── db/              SQLAlchemy 2 engine + base
│   │   ├── models/          32 ORM entities (incl. AuthAccount, AuthSession)
│   │   ├── scoring/         deterministic score / momentum / ranking / trust
│   │   ├── seed/            fictional demo data
│   │   └── services/        orchestration (evidence, founder, analysis, workflow…)
│   ├── alembic/             migrations
│   └── tests/               pytest suite
├── frontend/                Next.js 14 app
│   └── src/
│       ├── app/             pages (App Router)
│       ├── components/      Arena, guided tour, charts, tables, UI
│       └── lib/             api client, types, hooks
├── docs/                    architecture, scoring, momentum, AI, security, testing
├── docker-compose.yml       Postgres + backend + frontend
├── Makefile                 developer shortcuts
└── .env.example
```

## Known limitations

- **SQLite is the dev/test fallback**; Postgres is the production target (via docker-compose).
- **Live connectors are GitHub and web search (Tavily).** Web search covers company sites and launch
  pages (YC Launches, Show HN, Product Hunt, BetaList) only. Hackathons, papers, patents, accelerator
  cohorts and social signals are modeled and shown as *planned / not implemented* — never presented
  as live.
- **Web search finds what the provider has indexed.** Results vary between runs; a lead with no
  company domain can only be matched again through the same launch-page URL or a verified GitHub
  login, never by name.
- **AI features require an OpenAI key.** Without one they are unavailable (HTTP 503) — there is no
  fake fallback. The seeded demo analysis is static, clearly-labeled demo data; deterministic
  scoring always works.
- **Login is currently disabled; the API isn't auth-protected.** A full account system
  (signup/login, PBKDF2-hashed passwords, DB-persisted sessions) is implemented and available at
  `/api/auth/*` with passing tests, but the login screens are turned off — both interfaces open
  directly. No data/AI endpoint enforces a token, and the app operates on a single default fund.
  An investor's saved-prospect pipeline and recorded decisions are scoped **per browser**
  (localStorage); decisions are also written to the DB as a durable audit record. Re-enable login
  by wrapping the `/vc` and `/founder` layouts in `AuthGate`.
- **In-memory rate limiter** — fine for a single process; use Redis for multi-worker deploys.
- **Anonymous GitHub is limited to 60 requests/hour** — add `GITHUB_TOKEN` for 5000/hr.

See [docs/security-and-limitations.md](docs/security-and-limitations.md) for the full list.

## Further documentation

- [docs/architecture.md](docs/architecture.md)
- [docs/scoring-methodology.md](docs/scoring-methodology.md)
- [docs/founder-momentum.md](docs/founder-momentum.md)
- [docs/ai-prompting-and-validation.md](docs/ai-prompting-and-validation.md)
- [docs/security-and-limitations.md](docs/security-and-limitations.md)
- [docs/testing.md](docs/testing.md)
