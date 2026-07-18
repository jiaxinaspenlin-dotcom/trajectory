# Trajectory — AI Venture-Capital Operating System

Trajectory is an AI-powered operating system for venture capital that takes a fund from
**Sourcing → Screening → Diligence → Decision**. The **fund is the client**. Trajectory helps it
define a thesis, discover promising founders before they fundraise, accept inbound applications,
organize evidence, evaluate opportunities, surface contradictions and missing information, produce
an evidence-backed investment memo, and recommend an actionable next step within 24 hours —
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
- [Anthropic setup](#anthropic-setup)
- [GitHub setup](#github-setup)
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
  retries, and graceful handling of missing/deleted/incomplete data. Other connectors
  (hackathons, papers, patents, …) are *declared but honestly reported as not implemented*.
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
- **Evidence-backed memo** — structured investment memo that labels anything *Not disclosed /
  Not verified / Insufficient evidence* rather than inventing content.
- **24-hour recommendation tracker** — time from first signal to an actionable recommendation.
- **Human oversight** — the system recommends; the human records a separate decision. No automatic
  outreach or investment ever happens.

## The three differentiators

- **Founder Momentum** — measures the *direction and rate of change* of a founder's execution over
  time (contribution activity, releases, outside contributors, product iteration, …), labeling the
  trajectory `accelerating / improving / stable / declining / insufficient_history` and explaining
  *why* the score changed. GitHub **stars are never treated as commercial traction**.
- **Prestige-Free Ranking** — a **bias & sensitivity audit** that masks university, employer,
  accelerator, investor-network and geography-as-proxy signals while retaining substantive evidence
  (what was built, real traction, technical contributions, repeated execution). It shows how much
  prestige moves your ranking — without claiming the prestige-free view is automatically superior.
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
                                               │  ├─ AI provider (Anthropic)  │
                                               │  │   + deterministic fallback│
                                               │  └─ SQLAlchemy 2 + Alembic   │
                                               └───────────────┬──────────────┘
                                                               │
                                                   ┌───────────▼───────────┐
                                                   │ PostgreSQL (prod)      │
                                                   │ SQLite (dev/test)      │
                                                   └────────────────────────┘
```

- **Python owns** API integration, evidence processing, scoring/ranking, PDF processing, AI
  orchestration, data validation, and business logic.
- The **AI provider layer** is abstracted so another provider can be added without rewriting the app.
  With no `ANTHROPIC_API_KEY`, every AI service falls back to a deterministic, evidence-only result
  and the app still works end-to-end.
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

Open **http://localhost:3000** and click **Enter the platform**. The guided tour starts on the
first dashboard visit.

> Without `make`, run the equivalent commands shown in the Makefile — e.g.
> `cd backend && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt`,
> `./.venv/bin/alembic upgrade head`, `./.venv/bin/python -m app.seed.seed`,
> `./.venv/bin/uvicorn app.main:app --reload`.

## Quick start (Docker)

```bash
# Optional: export secrets so the containers pick them up (never commit them)
export ANTHROPIC_API_KEY=sk-ant-...        # optional — omit for fallback mode
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
| `ANTHROPIC_API_KEY` | Anthropic API key (server-side only) | empty → deterministic fallback mode |
| `ANTHROPIC_MODEL` | Claude model id | `claude-opus-4-8` |
| `GITHUB_TOKEN` | Raises GitHub rate limit to 5000/hr | empty → anonymous 60/hr |
| `DATABASE_URL` | SQLAlchemy URL | empty → SQLite file `backend/trajectory.db` |
| `BACKEND_CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:3000` |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend → backend base URL | `http://localhost:8000` |
| `MAX_UPLOAD_SIZE_MB` | Max pitch-deck upload size | `15` |
| `AI_RATE_LIMIT_PER_MINUTE` | Per-IP throttle on AI endpoints | `20` |
| `SECRET_KEY` | Internal signing seed | set your own in prod |
| `ENVIRONMENT` | `development` / `production` / `test` | `development` |

The Anthropic key is only ever read on the backend and is **never** included in the client bundle.
The Settings page shows a masked hint (last 4 chars) — never the full key.

## Anthropic setup

1. Get an API key from the Anthropic console.
2. Put it in `.env` as `ANTHROPIC_API_KEY=...` (and optionally set `ANTHROPIC_MODEL`).
3. Restart the backend. `GET /api/health` will report `ai.enabled: true`.

Without a key, all AI services (search parsing, three-axis assessment, diligence questions, Bull/
Bear/Referee, memo, pitch-deck interpretation) run a **deterministic, evidence-only fallback** and
label output `generated_by: "fallback"`. No facts are ever invented in either mode.

## GitHub setup

1. (Optional) Create a GitHub personal access token with **public** read scope.
2. Put it in `.env` as `GITHUB_TOKEN=...`.
3. From **Discovery → Add a real public GitHub profile**, enter a username and sync.

Only public data is collected, attributed to its source URL. Restricted platforms (LinkedIn, X)
are never scraped. Rate limits, missing profiles, deleted repos, and incomplete responses are
handled gracefully and reported on the Settings page.

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
# Backend — 36 pytest tests, ruff, mypy
cd backend
./.venv/bin/python -m pytest -q          # tests
./.venv/bin/ruff check app tests         # lint
./.venv/bin/mypy app                     # type-check

# Frontend — 14 Vitest tests + production build
cd frontend
npm run test                             # tests (vitest)
npx next build                           # production build (also type-checks)
```

Or simply `make test`, `make lint`, `make build`.

**Current status:** backend 36/36 tests pass, ruff clean, mypy clean (53 files);
frontend 14/14 tests pass, `next build` succeeds (9 routes).

## API overview

Interactive OpenAPI docs at **`/docs`** (schema at `/openapi.json`). 46 documented endpoints, incl.:

- `GET /api/health`, `GET /api/settings`, `GET /api/connectors/status`
- `GET/POST/PUT /api/thesis…`
- `GET /api/founders`, `/founders/{id}`, `/founders/{id}/score[/history]`, `/founders/{id}/momentum`
- `GET /api/companies…`, `/api/evidence…`, `/api/claims…`, `/api/contradictions`
- `POST /api/applications`, `POST /api/applications/{id}/upload-deck`
- `POST /api/sourcing/github/sync`, `GET /api/sourcing/prospects`, `POST …/action`
- `POST /api/search/parse`, `POST /api/search/apply`
- `GET /api/opportunities…`, `POST …/analyze | assessment | diligence | arena | memo`
- `GET …/workflow`, `POST …/decision`, `POST …/validate-evidence-refs`
- `GET /api/ranking`, `/ranking/prestige-audit`, `/ranking/prestige-sensitivity`
- `GET/PUT /api/tour`, `GET /api/dashboard`

## Product pages

`/` landing · `/thesis` onboarding & thesis · `/dashboard` main dashboard (+ guided tour) ·
`/discovery` NL search + GitHub sourcing · `/apply` inbound application + PDF upload ·
`/opportunities/[id]` founder profile (score, momentum, three axes, claims/trust, Arena, timer,
human decision) · `/opportunities/[id]/diligence` diligence workspace ·
`/opportunities/[id]/memo` investment memo (print/PDF) · `/settings` data sources & status.

## Project layout

```
Trajectory/
├── backend/                 FastAPI app
│   ├── app/
│   │   ├── ai/              provider + services + validation (Anthropic, fallback)
│   │   ├── api/             REST routers
│   │   ├── connectors/      GitHub (live) + connector interfaces
│   │   ├── core/            config, security (SSRF), rate limiting
│   │   ├── db/              SQLAlchemy 2 engine + base
│   │   ├── models/          30 ORM entities
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
├── docs/                    architecture, scoring, prestige, momentum, AI, security, testing
├── docker-compose.yml       Postgres + backend + frontend
├── Makefile                 developer shortcuts
└── .env.example
```

## Known limitations

- **SQLite is the dev/test fallback**; Postgres is the production target (via docker-compose).
- **Only the GitHub connector is live.** Hackathons, product launches, papers, patents,
  accelerator cohorts and social signals are modeled and shown as *planned / not implemented* —
  never presented as live.
- **AI requires a key or runs in deterministic fallback.** Fallback output is honest and
  evidence-only, but less nuanced than model output.
- **Single default fund / no authentication yet.** Users, funds and multi-tenancy are fully
  modeled, but there is no login flow in this version.
- **In-memory rate limiter** — fine for a single process; use Redis for multi-worker deploys.
- **Anonymous GitHub is limited to 60 requests/hour** — add `GITHUB_TOKEN` for 5000/hr.

See [docs/security-and-limitations.md](docs/security-and-limitations.md) for the full list.

## Further documentation

- [docs/architecture.md](docs/architecture.md)
- [docs/scoring-methodology.md](docs/scoring-methodology.md)
- [docs/founder-momentum.md](docs/founder-momentum.md)
- [docs/prestige-audit.md](docs/prestige-audit.md)
- [docs/ai-prompting-and-validation.md](docs/ai-prompting-and-validation.md)
- [docs/security-and-limitations.md](docs/security-and-limitations.md)
- [docs/testing.md](docs/testing.md)
