# Copy style: capitalization

Trajectory uses **sentence case for all interface text**: capitalize the first
word and proper names, and nothing else.

This covers page titles, section headings, buttons, links, tabs, table headers,
form labels, badges, placeholders, hints, toasts, empty states, errors,
tooltips, `aria-label`s, the guided tour, the landing page and the founder
portal.

| Write | Not |
|---|---|
| Source founders | Source Founders |
| Run analysis | Run Analysis |
| Final recommendation | Final Recommendation |
| GitHub profile | Github Profile |
| Idea vs Market | Idea Vs Market |

## Always capitalized (names)

These keep their capitals wherever they appear, including mid-sentence.

- **Product areas:** Dashboard, Map, Founders, Pipeline, Fund
- **Stages:** Sourcing, Screening, Diligence, Decision
- **Named features:** Founder Score, Founder Momentum, Investment Arena,
  Custom Axes, Relationships, Trust Score, Bull, Bear, Referee
- **Proper nouns and acronyms:** GitHub, Tavily, OpenAI, Product Hunt, Show HN,
  YC, PDF, URL, AI

The three screening axes are names too: Founder, Market, and Idea vs Market.

A product area or stage is capitalized when the text means that area or stage
("Move to Screening", "View in Pipeline", "View on Map"). The ordinary word is
not ("diligence questions", "your fund's thesis", "a map of every lead").

## Where text comes from

- **Source text is sentence case.** Text that is uppercase on screen (the
  `.label` class, table headers) is uppercase through CSS only; the string in
  the source stays sentence case.
- **Stored values are not display text.** Enum values, API keys, routes, test
  IDs and anything stored in the database keep their exact values. Some stored
  values are Title Case for historical reasons: recommended actions
  (`"Continue Diligence"`), the `"Insufficient Evidence"` axis label, and
  application `missing_fields` (`"GitHub Profile"`). Show them through
  `humanStatus()` in `frontend/src/lib/format.ts`, which maps known values to
  the right text and sentence-cases the rest.
- **Backend display strings** (action labels and details, API messages) follow
  the same rule. Use `action_label()` in `backend/app/services/action_queue.py`
  to show a recommended action inside a sentence.

## Guarding it

`frontend/src/components/copy-style.test.tsx` renders the main pages and
components and fails on known bad patterns: "Vs", "Github", and Title Case
pairs in buttons, links, headings, tabs, table headers, labels and
accessible names. When you add a new name to the glossary above, add it to
`GLOSSARY` in that test too.
