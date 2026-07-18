# Security & Limitations

This document describes the security measures actually implemented in the
codebase, followed by an honest accounting of current limitations. Accuracy over
marketing: where something is a dev-only convenience or not yet built, it says so.

---

## 1. Security measures implemented

### Secrets & configuration
- All secrets are loaded from the environment / `.env`
  (`app/core/config.py`, pydantic-settings). No secret is hardcoded.
- The Anthropic API key is loaded on the backend only, **never logged** (the AI
  provider logs only model + token counts + elapsed time) and **never sent to
  the client**.
- `GET /api/settings` returns only masked hints (`…{last4}`), never full keys
  (`mask()` helper). Verified by
  `tests/test_endpoints_e2e.py::test_settings_never_leaks_full_key`.

### No keys in the client bundle
All AI and connector calls run server-side. The Next.js frontend talks only to
the backend API; no provider keys are embedded in client code.

### CORS
`CORSMiddleware` is restricted to configured origins
(`BACKEND_CORS_ORIGINS`, default `http://localhost:3000`) rather than a wildcard.

### File upload handling (`app/services/pdf.py`)
- **Type validation**: only `.pdf` extensions; content-type restricted to
  `application/pdf` / `application/octet-stream` / empty; the file must start
  with the `%PDF-` magic header.
- **Size validation**: rejected if empty or larger than
  `MAX_UPLOAD_SIZE_MB` (default 15 MB).
- **Safe filename handling**: `sanitize_filename` strips path components
  (`Path(name).name`) and replaces unsafe characters, blocking traversal
  (`../../etc/passwd` → `passwd`).
- **Stored outside the static dir**: decks are written to the upload directory
  (never a public/static path) with a random `secrets.token_hex(16)_` prefix.
- Extraction uses pypdf and never executes embedded content.

### Server-side external calls & SSRF protection (`app/core/security.py`)
- `validate_public_url` allows only `http`/`https`, blocks `file/ftp/gopher/data`
  schemes, resolves the host, and rejects any address that is private,
  loopback, link-local, or reserved (`UnsafeURLError`) — SSRF protection before
  any server-side fetch of a user-supplied URL.
- `parse_github_repo_url` safely extracts `(owner, repo)` from GitHub URLs.

### Database access
All persistence goes through the SQLAlchemy 2 ORM with parameterized queries —
no raw string SQL concatenation.

### Rate limiting & timeouts for AI
- AI-invoking endpoints depend on `ai_rate_limit`
  (`app/core/rate_limit.py`): a per-client-IP sliding-window limiter,
  `AI_RATE_LIMIT_PER_MINUTE` (default 20), returning HTTP 429 when exceeded.
- The AI provider enforces request timeouts (`AI_TIMEOUT_SECONDS`, default 60s)
  and the GitHub connector enforces `HTTP_TIMEOUT_SECONDS` (default 30s).

### Secure error messages
Provider and connector exceptions are caught and truncated; callers surface
`AIError` / structured connector statuses rather than raw stack traces or
provider internals.

### No automatic outreach or investment — human approval required
- No cold outreach is ever sent. `recommend_outreach` only *prepares* a
  `RecommendedAction` "for human approval. Nothing is sent automatically."
- Recommendations are never auto-executed; a `HumanDecision` is recorded
  **separately** from the system recommendation, and the API response states
  "No outreach or investment is executed automatically."
- Only public GitHub data is collected; restricted platforms (LinkedIn, X) are
  never scraped. Demo data is clearly labeled (`is_demo`) and never silently
  mixed with real evidence.

---

## 2. Limitations (honest)

These are real constraints of the current build. None are hidden in the code —
several are surfaced through API responses and status endpoints.

- **SQLite is the dev fallback.** With no `DATABASE_URL`, the app uses a local
  SQLite file and auto-creates tables at startup. Production uses **Postgres**
  (via docker-compose) with Alembic migrations. SQLite is a zero-config
  convenience so the app and its tests run without a database container.

- **In-memory rate limiter (single process).** `ai_rate_limit` stores windows
  in a process-local dict. It is correct for a single-process deployment only;
  behind multiple workers it should move to Redis. This is documented directly
  in the module.

- **Only the GitHub connector is live.** Hackathons, product launches, papers,
  patents, accelerator cohorts, and social signals are declared in the source
  type enum and connector interface but **not implemented**. They are served by
  `UnavailableConnector`, which reports `status: "not_implemented"`.
  `GET /api/connectors/status` lists them honestly as `planned_unavailable`.

- **No authentication / multi-tenant login yet.** There is no login or auth
  layer. The API operates on a single default fund (`default_fund` creates a
  "Demo Fund" if none exists). Multi-fund is fully *modeled* (Fund → Thesis →
  Opportunity) but not gated by user identity or access control.

- **AI requires a key or runs in deterministic fallback.** With no
  `ANTHROPIC_API_KEY`, `ai_enabled` is False and every AI service uses its
  evidence-only fallback. The product is fully functional this way, but LLM
  interpretation quality is only available when a key is configured.

- **GitHub anonymous rate limit is 60 requests/hour.** Without `GITHUB_TOKEN`
  the connector uses the anonymous public API (60/hr); a token raises this to
  5000/hr. Rate-limited syncs return `SyncStatus.RATE_LIMITED` with a message to
  add a token, rather than failing silently.

- **No production hardening beyond the above.** `SECRET_KEY` defaults to a
  placeholder that must be set in production; there is no CSRF layer, WAF, or
  audit-log signing. The workflow's 24-hour target is a tracking goal, not an
  SLA.
