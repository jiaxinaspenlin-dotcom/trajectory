"""Interface copy helpers (docs/copy-style.md).

Labels, headings and short phrases are Title Case. This mirrors titleCase() in
frontend/src/lib/format.ts: minor words stay lowercase unless first or last in
a phrase, both halves of a hyphenated word are capitalized, and units, numbers,
@handles and mixed-case names (GitHub, InsForge) are left as they are.
"""

from __future__ import annotations

import re

MINOR = frozenset(
    "a an the and but or nor for so yet as at by in of off on per to up via vs with from into than".split()
)
NAMES = {
    "github": "GitHub", "openai": "OpenAI", "tavily": "Tavily", "ai": "AI", "url": "URL", "urls": "URLs",
    "pdf": "PDF", "yc": "YC", "hn": "HN", "swot": "SWOT", "kpi": "KPI", "kpis": "KPIs", "api": "API",
    "mau": "MAU", "id": "ID", "ids": "IDs", "tam": "TAM", "vc": "VC",
}
BREAKS = frozenset({"·", "—", "–", "/", "|", "→", "←"})
_WORD = re.compile(r"^([^A-Za-z0-9@$]*)(.*?)([^A-Za-z0-9%]*)$")


def _case_part(part: str, edge: bool) -> str:
    # units, values, handles, domains and abbreviations (3d, $250K, @ada, insforge.dev, e.g.)
    if not re.search(r"[A-Za-z]", part) or re.search(r"\d", part) or part.startswith("@") or re.search(r"\.[A-Za-z]", part):
        return part
    if part.lower() in NAMES:
        return NAMES[part.lower()]
    if re.search(r"[A-Z]", part[1:]):
        return part  # mixed case or an acronym: a name, keep it
    lower = part.lower()
    if not edge and lower in MINOR:
        return lower
    return lower[:1].upper() + lower[1:]


def _case_word(word: str, edge: bool) -> str:
    m = _WORD.match(word)
    if not m or not m.group(2):
        return word
    lead, core, trail = m.groups()
    parts = core.split("-")
    return lead + "-".join(_case_part(p, (edge or bool(lead)) if i == 0 else True) for i, p in enumerate(parts)) + trail


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
    return "".join(
        _case_word(t, k in edges) if t.strip() and t not in BREAKS else t for k, t in enumerate(tokens)
    )
