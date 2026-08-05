# Testing

Trajectory ships with **39 backend tests** and **11 frontend tests**. The suites
are designed to run **offline** — no network, no API key, no Postgres — so
they exercise the deterministic core and the safety guarantees directly.

---

## 1. Running the tests

### Backend (42 tests)

```bash
cd backend && ./.venv/bin/python -m pytest -q
```

`tests/conftest.py` forces a throwaway SQLite database, sets
`OPENAI_API_KEY=""` (so AI services raise `AIError` and AI endpoints return
503), provides a `mock_ai` fixture that stubs `provider.generate_json` for tests
that need model output, and raises the AI rate limit to 1000/min for testing.
The schema is created and dropped around the session; endpoint tests seed demo
data via the `seeded` fixture.

### Frontend (13 tests)

```bash
cd frontend && npm run test      # vitest run
```

Uses Vitest 2 + Testing Library + jsdom. The API client is mocked, so no backend
is required.

### Linting / typechecking / build

```bash
# backend
cd backend && ./.venv/bin/ruff check .
cd backend && ./.venv/bin/mypy app

# frontend
cd frontend && npm run lint
cd frontend && npm run build     # next build
```

---

## 2. Backend test coverage (39)

### `test_scoring.py` — deterministic scoring core (8)
- **Founder Score determinism & bounds**: same evidence → same score; `0–100`;
  component weights sum to 1.0.
- **Missing-evidence fairness**: empty evidence → score 0, confidence 0, every
  component `missingness >= 0.99`, "Insufficient evidence" explanation.
- **Confidence grows with evidence**: more evidence → higher confidence.
- **Momentum trajectory**: 20→25→30→45 over 90 days gives `change_30d = 15`,
  trajectory `accelerating`, explanation mentions "release frequency".
- **Momentum insufficient history**: empty series → `insufficient_history`.
- **Trust score**: independent + verified beats founder-reported; contradictions
  penalize; results bounded 0–100.
- **Numeric contradiction detection**: 2000 vs 800 users flagged `high`
  (>50% apart); revenue claim not falsely flagged.

### `test_ai_and_validation.py` — AI safety & validation (9)
- **Evidence-ID rejection**: unknown IDs rejected, valid ones kept.
- **Point sanitization**: all-invalid / empty points flagged `unverified`.
- **Malformed AI JSON handling**: `_extract_json` parses fenced and
  prose-wrapped JSON; raises `AIError` on garbage.
- **No key → `AIError`** (`test_services_raise_without_api_key`): with no
  `OPENAI_API_KEY`, AI services raise rather than fabricating output.
- Using the `mock_ai` fixture (stubs `provider.generate_json`):
  - **Axes independent & IDs validated**: three distinct axis scores (never
    averaged); hallucinated evidence IDs are stripped.
  - **Invalid referee action normalized** to the allowed set.
  - **Bear point without evidence** is flagged `unverified`.
  - **Pitch extraction** returns structured, page-tagged facts.

### `test_pdf_github_workflow.py` — I/O safety & connector resilience (8)
- **PDF validation**: rejects non-`.pdf` extension, bad header, empty file;
  accepts a valid `%PDF-` header.
- **Filename sanitization** blocks path traversal (`../../etc/passwd` →
  `passwd`).
- **GitHub failure/rate-limit handling** via a mocked `httpx.MockTransport`
  (no network): 404 → `NOT_FOUND` with no evidence; 403 +
  `X-RateLimit-Remaining: 0` → `RATE_LIMITED`; success path normalizes
  `github_profile` + `github_repo` evidence and confirms stars are labeled "not
  commercial traction".

### `test_auth.py` — authentication (4)
- **Signup persists a real account** and returns a session token; the token
  authenticates `GET /api/auth/me`; a duplicate email+role signup is rejected
  (409); login with the right password succeeds and issues a new token; a wrong
  password is rejected (401).
- **`/me` requires a valid token** — no header and a bogus token both return 401.
- **Same email, different roles** — an investor and a founder account may share
  an email and are distinct records.
- **Login is role-scoped** — correct credentials with the wrong role are rejected.

### `test_endpoints_e2e.py` — API & full happy path (10)
- **Health** endpoint; **settings never leaks full key**; **thesis CRUD** with
  impact summary; **connector status** (github live, planned connectors
  `live == False`).
- **AI endpoints return 503 without a key**
  (`test_ai_endpoints_return_503_without_key`): with no `OPENAI_API_KEY`, AI
  routes respond 503 (`ai_unavailable: true`) instead of fabricating output.
- **Full happy-path E2E** (`test_full_happy_path`, uses the `mock_ai` fixture):
  thesis → inbound
  application (missing fields identified) → upload & parse a real 2-page PDF →
  invalid file type rejected (422) → run `/analyze` → three independent axes
  present → Arena bull/bear + referee recommendation → memo sections generated →
  record a **separate** human decision keeping `system_recommended_action`.
- **Evidence-ref validation endpoint** rejects nonexistent IDs
  (`all_valid == False`).
- **Search parse** returns editable filters and the "not the entire internet"
  disclaimer.

---

## 3. Frontend test coverage (11)

### `components/components.test.tsx` (5)
- **ThreeAxes** (1): renders Founder / Market / Idea vs Market with three
  distinct scores (72, 40, 65) and a "not averaged" note.
- **MomentumChart** (1): shows current score (45), 30-day change (+15),
  trajectory "Accelerating", and "release frequency increased".
- **GuidedTour** (3): Next → Back with a step counter (`Step N of {DASHBOARD_TOUR.length}`,
  computed dynamically); `onClose` called on skip; renders nothing when closed.

### `components/arena/InvestmentArena.test.tsx` (6)
- Renders **bull, bear, referee** and the recommendation ("Continue Diligence").
- **Hover** reveals the bull speech bubble.
- **Keyboard focus** reveals the bear speech bubble (not hover-only —
  accessible).
- **Click** pins the detailed Referee assessment (evidence-that-would-change
  text visible).
- **Unverified** points (no evidence IDs) are marked "unverified".
- **Empty** state: a null debate renders the `arena-empty` placeholder.
