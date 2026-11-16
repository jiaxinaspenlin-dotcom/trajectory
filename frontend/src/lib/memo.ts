import { Memo, MemoSection } from "@/lib/types";

// The canonical, always-present investment-memo sections, in order. Kept in sync
// with backend MEMO_SECTIONS (app/ai/services.py). The UI renders all of these
// for every memo so an investor always sees the full structure — even for memos
// generated before a section existed. Missing sections are shown as placeholders
// (regenerating the memo fills them from evidence).
export const CANONICAL_MEMO_SECTIONS: { key: string; title: string }[] = [
  { key: "snapshot", title: "Company snapshot" },
  { key: "hypotheses", title: "Investment hypotheses" },
  { key: "swot", title: "SWOT" },
  { key: "team", title: "Team & history" },
  { key: "problem_product", title: "Problem & product" },
  { key: "technology", title: "Technology & defensibility" },
  { key: "market", title: "Market sizing" },
  { key: "competition", title: "Competition" },
  { key: "traction", title: "Traction & KPIs" },
  { key: "financials", title: "Financials & round structure" },
  { key: "cap_table", title: "Cap table" },
  { key: "diligence_log", title: "Due diligence log" },
  { key: "exit", title: "Exit perspective" },
];

// Merge a memo's stored sections onto the canonical structure: canonical order,
// stored content where present, a labeled placeholder otherwise. Any non-canonical
// stored sections (from older memos) are appended so no content is ever lost.
export function normalizeMemoSections(memo: Memo): MemoSection[] {
  const byKey = new Map(memo.sections.map((s) => [s.key, s]));
  const ordered: MemoSection[] = CANONICAL_MEMO_SECTIONS.map(({ key, title }) => {
    const stored = byKey.get(key);
    if (stored) return { ...stored, title };
    return {
      key,
      title,
      body: "Not yet covered — regenerate the memo to populate this section from the available evidence.",
      evidence_ids: [],
      unavailable_label: "Insufficient evidence",
    };
  });
  const canonicalKeys = new Set(CANONICAL_MEMO_SECTIONS.map((c) => c.key));
  const extras = memo.sections.filter((s) => !canonicalKeys.has(s.key));
  return [...ordered, ...extras];
}
