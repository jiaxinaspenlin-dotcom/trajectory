"""Interface copy helpers (docs/copy-style.md).

Labels, headings and short phrases are Title Case. This mirrors titleCase() in
frontend/src/lib/format.ts: minor words stay lowercase unless first or last in
a phrase or the particle of a phrasal verb (Fill In), both halves of a hyphenated
word are capitalized, and units, numbers, @handles and mixed-case names (GitHub,
InsForge) are left as they are.
"""

from __future__ import annotations

import re

MINOR = frozenset(
    "a an the and but or nor for as at by in of on per to via vs with from into than".split()
)
# "in", "on" and "out" complete a verb here, so they are capitalized: Set Up, Fill In,
# Log Out, Opt In. After anything else they are prepositions ("7 in Pipeline").
PARTICLES = frozenset({"in", "on", "out"})
PHRASAL = frozenset(
    (
        "fill filled filling log logged logging sign signed signing opt opted opting check checked checking "
        "turn turned turning carry carried carrying zoom zoomed zooming plug plugged plugging type typed typing "
        "hand handed handing read reading drill drilled drilling dial dialed dialing weigh weighed weighing "
        "follow followed following find found finding point pointed pointing build built building"
    ).split()
)
NAMES = {
    "github": "GitHub", "openai": "OpenAI", "tavily": "Tavily", "ai": "AI", "url": "URL", "urls": "URLs",
    "pdf": "PDF", "yc": "YC", "hn": "HN", "swot": "SWOT", "kpi": "KPI", "kpis": "KPIs", "api": "API",
    "mau": "MAU", "id": "ID", "ids": "IDs", "tam": "TAM", "vc": "VC", "ml": "ML", "saas": "SaaS",
    "b2b": "B2B", "b2c": "B2C", "llm": "LLM", "llms": "LLMs", "devops": "DevOps",
}
UNITS = frozenset({"pt", "pts"})  # left lowercase like 3d or 30d
BREAKS = frozenset({"·", "—", "–", "/", "|", "→", "←"})
_WORD = re.compile(r"^([^A-Za-z0-9@$]*)(.*?)([^A-Za-z0-9%]*)$")


def _case_part(part: str, edge: bool, after_verb: bool = False) -> str:
    if part.lower() in NAMES:
        return NAMES[part.lower()]
    # units, values, handles, domains and abbreviations (3d, $250K, @ada, insforge.dev, e.g.)
    if not re.search(r"[A-Za-z]", part) or re.search(r"\d", part) or part.startswith("@") or re.search(r"\.[A-Za-z]", part):
        return part
    if part in UNITS:
        return part
    if re.search(r"[A-Z]", part[1:]):
        return part  # mixed case or an acronym: a name, keep it
    lower = part.lower()
    if not edge and lower in MINOR and not (after_verb and lower in PARTICLES):
        return lower
    return lower[:1].upper() + lower[1:]


def _case_word(word: str, edge: bool, after_verb: bool = False) -> str:
    m = _WORD.match(word)
    if not m or not m.group(2):
        return word
    lead, core, trail = m.groups()
    if "/" in core:
        return word  # paths and slash pairs are values: ada/ledgerkit, ai/ml
    parts = core.split("-")
    return lead + "-".join(
        _case_part(p, (edge or bool(lead)) if i == 0 else True, i == 0 and not lead and after_verb)
        for i, p in enumerate(parts)
    ) + trail


def title_case(text: str) -> str:
    tokens = re.split(r"(\s+)", text)
    word_idx = [k for k, t in enumerate(tokens) if t.strip() and t not in BREAKS]
    edges: set[int] = set()
    start_next = True
    for k, t in enumerate(tokens):
        if not t.strip():
            continue
        if t in BREAKS:
            start_next = True
            continue
        if start_next:
            edges.add(k)
            start_next = False
        if t.endswith(":"):
            start_next = True
    for n, k in enumerate(word_idx):
        following = next((t for t in tokens[k + 1:] if t.strip()), None)
        if n == len(word_idx) - 1 or tokens[k].endswith(":") or following in BREAKS:
            edges.add(k)
    def after_verb(k: int) -> bool:
        prev = tokens[k - 2] if k >= 2 else ""
        return prev.lower() in PHRASAL and prev not in BREAKS

    return "".join(
        _case_word(t, k in edges, after_verb(k)) if t.strip() and t not in BREAKS else t
        for k, t in enumerate(tokens)
    )
