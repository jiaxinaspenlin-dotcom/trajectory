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
- empty-state titles, tooltips and `aria-label`s;
- guided tour titles, landing page headings and the founder portal.

The rules:

- Capitalize the first and last word, and every major word.
- Lowercase these minor words unless they are first or last in the phrase:
  a, an, the, and, but, or, nor, for, so, yet, as, at, by, in, of, off, on,
  per, to, up, via, vs, with, from, into, than. ("Next Up" keeps Up because it
  is the last word.)
- A phrase restarts after `·`, `—`, `/` and a colon, so the word after one is
  a first word and the word before one is a last word: "Recommended: Continue
  Diligence", "New Inbound Application · Waiting 4d".
- Capitalize both parts of a hyphenated term: "Evidence-Backed", "30-Day".
- Leave units, values, handles and domains alone: 3d, 30d, $250K, 8%, @ada,
  insforge.dev.
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

## Sentences

Full sentences stay sentences: a capital first letter, the rest lowercase
except names, with their ending punctuation. This covers descriptions, helper
text, hints, confirmation text, error messages, toasts, evidence excerpts,
AI-written analysis and memo body text.

A good test: if it has a verb and ends with a period or question mark, it is a
sentence. A description that is written as a sentence gets its period
("Matches raise a company's thesis fit score."). Inside sentences, product
names stay capitalized: Dashboard, Map, Founders, Pipeline, Fund, Sourcing,
Screening, Diligence, Decision, Founder Score.

## Never re-case content

Leave user and third-party content exactly as it is: company and founder names,
evidence titles, source page titles, sectors and anything an investor or founder
typed. Placeholders that show an example value ("e.g. fintech",
"Founders and roles") are content too. Placeholders that prompt ("Search
Founders, Companies, Topics", "Choose an Action…") are labels.

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
  the full debate. The Map's cluster names (sectors, languages) are content and
  are shown as typed.

## Guarding it

`frontend/src/components/copy-style.test.tsx` renders the main pages and
components. It fails on:
- a label, button, heading, tab, badge, table header or accessible name that
  isn't Title Case (for example "Review recommendation");
- a capitalized minor word mid-phrase ("Idea Vs Market");
- a miscased name ("Github").

Sentences are skipped. Fixture content (names, evidence titles) is listed in
`CONTENT` there; add to it when a new fixture contains user content.
`backend/tests/test_copy_style.py` checks `title_case()` and the action queue
labels.
