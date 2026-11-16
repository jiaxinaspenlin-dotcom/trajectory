# Copy style: capitalization

Trajectory uses **Title Case for every label, heading and short phrase**, and
normal sentence capitalization for full sentences.

## Title Case

Use it for:
- page titles and subtitles;
- section headings, card titles and eyebrows ("Next Up");
- nav items, buttons, links and tabs;
- table headers, form labels, badges and pills;
- menu items, filter and toggle options;
- stat captions and status lines;
- empty-state titles, loading lines ("Loading Dashboard…"), tooltips and
  `aria-label`s;
- prompt placeholders ("Search Founders, Companies, Topics", "Your Name");
- guided tour titles, landing page headings, the founder portal, sign-in and
  the browser tab title.

The rules:

- Capitalize the first and last word, and every major word.
- Lowercase these minor words unless they are first or last in the phrase:
  a, an, the, and, but, or, nor, for, as, at, by, in, of, on, per, to, via,
  vs, with, from, into, than.
- Up, Off, Yet and So are always capitalized: "Next Up", "Not Yet in
  Pipeline", "So Far".
- In, On and Out are capitalized when they complete a verb (a phrasal verb):
  "Set Up Your Fund Thesis", "Fill In What You Can", "Log Out", "Opt In". As
  prepositions they stay lowercase: "7 in Pipeline". The helpers recognize the
  verbs listed in `PHRASAL`; add a verb there when a new label needs it.
- A phrase restarts after `·`, `—`, `/` and a colon, so the word after one is
  a first word and the word before one is a last word: "Recommended: Continue
  Diligence", "New Inbound Application · Waiting 4d".
- Capitalize both parts of a hyphenated term: "Evidence-Backed", "30-Day".
- Leave units, values, handles, domains and paths alone: 3d, 30d, +16.4 pts,
  $250K, 8%, @ada, insforge.dev, ada/ledgerkit, ai/ml.
- Names and acronyms keep their own spelling: GitHub, OpenAI, Tavily, Product
  Hunt, Show HN, YC, PDF, URL, AI.

Examples from the Dashboard:

| Before | After |
|---|---|
| Needs attention | Needs Attention |
| Next up | Next Up |
| Take the tour | Take the Tour |
| Source founders | Source Founders |
| Review recommendation | Review Recommendation |
| Northstar Ventures (Demo) · what to do next | Northstar Ventures (Demo) · What to Do Next |
| Recommended: Continue diligence | Recommended: Continue Diligence |
| New inbound application · waiting 4d | New Inbound Application · Waiting 4d |
| 12 more: 5 leads in Founders | 12 More: 5 Leads in Founders |
| Founder portal | Founder Portal |
| All in Pipeline | All in Pipeline (unchanged) |
| Fill in what you can | Fill In What You Can |
| Not yet in pipeline | Not Yet in Pipeline |

## Sentences

Full sentences stay sentences: a capital first letter, the rest lowercase
except names, with their ending punctuation. This covers descriptions, helper
text, hints, confirmation text, error messages, toasts, evidence excerpts,
AI-written analysis and memo body text.

A good test: if it has a verb and ends with a period or question mark, it is a
sentence. Error messages are sentences even when the API sends a bare phrase:
`ErrorState` adds the period ("Internal Server Error."). A description that is written as a sentence gets its period
("Matches raise a company's thesis fit score."). Inside sentences, product
names stay capitalized: Dashboard, Map, Founders, Pipeline, Fund, Sourcing,
Screening, Diligence, Decision, Founder Score.

## Never re-case content

Leave user and third-party content exactly as it is: company and founder names,
GitHub handles, company one-liners and headlines, evidence titles and quotes,
source page titles, search queries, sectors (including the Map's sector
groups), file names and anything an investor or founder typed.

Placeholders that show an example value are content, and they say so: they
start with "e.g." ("e.g. fintech, ai/ml, devtools") or are a URL or email
format ("https://…", "you@example.com"). Every other placeholder prompts, so
it is a label ("Founders and Roles", "Search Founders, Companies, Topics").

Mark content in the markup with `data-content` on the element that holds it,
so copy checks skip it. When a name would otherwise sit inside an
`aria-label`, label the region by its heading with `aria-labelledby` instead
("Record Sections", not "{name} Sections").

## Generated text

Text written by the AI or by backend rules is ours, not the user's, so it is
shown in the house style without changing its words:

- **Phrases shown as labels** (missing information and gaps, risks, a web
  result's What's Unknown, required diligence, debate headlines) go through
  `labelPhrase()`: Title Case, unless the phrase was written as a sentence.
- **Statements shown on their own** (supporting points, debate points and
  speech, strongest points, unresolved questions, SWOT quadrants, a
  verification basis tooltip) go through `asSentence()`: a capital first
  letter and closing punctuation, words untouched.
- **Longer analysis** (summaries, rationales, memo body, why a result
  surfaced) is already written as sentences and is shown as is.
- **Source names** are content ("GitHub ada/ledgerkit", a page title);
  `sourceName()` only re-cases the "(demo)" marker on seeded sources.

## Where text comes from

- **One helper.** `titleCase()` in `frontend/src/lib/format.ts` implements the
  rule. `title_case()` in `backend/app/services/copy.py` mirrors it for
  backend display text. Use these helpers for generated labels; don't
  hand-roll casing.
- **Stored values.** Enum values, API keys, routes, test IDs and anything
  stored in the database keep their exact values. Show them through
  `humanStatus()`, which Title Cases them: "Idea vs Market", "GitHub Profile",
  "Continue Diligence", "Insufficient Evidence", "Insufficient History".
- **Older records.** Founder Score component names and memo section titles are
  re-cased when they are served (in `serializers.py`) and when they are shown,
  so records already in the database match new ones.
- **CSS.** Labels are not uppercased through CSS; what is in the source is
  what is shown. The one exception is decoration: the "Bull vs Bear" intro of
  the full debate. The Map's sector clusters are content and are shown as
  typed; its generated groups are labels ("Go Projects", "Not Enough Data to
  Group").

## Guarding it

`frontend/src/components/copy-style.test.tsx` renders every route in
`src/app` and each state with its own copy: every record tab for a deal, a
sourcing lead and a deal with no linked founder; drawers, menus, the guided
tour, the decision form and its errors, the Fund editor and its errors, web
search results, loading and error states, the founder portal steps, sign-in
and toasts. It reads every element that has text, not only buttons and
headings, plus accessible names, tooltips and placeholders, and fails on:
- a label that isn't Title Case (for example "Review recommendation" or
  "Loading dashboard…");
- a capitalized minor word mid-phrase ("Idea Vs Market");
- a miscased name ("Github").

Sentences and `data-content` are skipped. Fixture content that appears inside
a label or accessible name ("Review ada") is listed in `CONTENT` there; add to
it when a new fixture contains user content. When you add a route or a state
with its own copy, add it to that test.
`backend/tests/test_copy_style.py` checks `title_case()` and the action queue
labels.
