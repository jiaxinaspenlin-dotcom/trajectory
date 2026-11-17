"use client";

import { Memo } from "@/lib/types";
import { memoText, normalizeMemoSections } from "@/lib/memo";
import { Badge, Reveal } from "@/components/ui";
import { asSentence, humanStatus, titleCase } from "@/lib/format";
import { EvidenceRef } from "./EvidenceRef";

// The evidence-backed investment memo as a document: the final recommendation,
// then every section that has content, in order. Sections with nothing yet are
// named once at the end instead of repeating a placeholder. Missing data is
// labeled, never invented. Shared by the Arena dropdown and the memo page.
export function MemoView({ memo }: { memo: Memo }) {
  const sections = normalizeMemoSections(memo);
  const covered = sections.filter((s) => !s.placeholder);
  const missing = sections.filter((s) => s.placeholder);
  return (
    <div className="space-y-8">
      {memo.recommended_action && (
        <div className="rounded-2xl bg-brand-wash px-5 py-4">
          <span className="label text-brand">Final Recommendation</span>
          <p className="text-title text-brand">{humanStatus(memo.recommended_action)}</p>
          <p className="text-xs text-ink-muted">Confidence {Math.round(memo.confidence * 100)}%</p>
        </div>
      )}
      {covered.map((s, i) => (
        <Reveal as="section" key={s.key} i={i % 3} aria-labelledby={`memo-${s.key}`} className="border-t border-line pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`memo-${s.key}`} className="text-section text-ink">{titleCase(s.title)}</h2>
            {s.unavailable_label && <Badge tone="bg-neutral-wash text-neutral">{humanStatus(s.unavailable_label)}</Badge>}
          </div>
          <div className="mt-2">
            {s.key === "swot" ? <SwotGrid body={memoText(s.body)} /> : <p className="whitespace-pre-line text-[15px] leading-7 text-ink-soft">{memoText(s.body)}</p>}
          </div>
          {s.evidence_ids.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">Evidence: {s.evidence_ids.map((e) => <EvidenceRef key={e} id={e} />)}</p>
          )}
        </Reveal>
      ))}
      {missing.length > 0 && (
        <section aria-labelledby="memo-missing" className="rounded-xl bg-surface-sunken px-5 py-4" data-testid="memo-missing">
          <h2 id="memo-missing" className="flex flex-wrap items-center gap-2 text-section text-ink">
            Not Yet Covered <Badge tone="bg-white text-neutral">Insufficient Evidence</Badge>
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{missing.map((s) => titleCase(s.title)).join(" · ")}</p>
          <p className="mt-1 text-meta text-ink-muted">Regenerate the memo to populate these sections from the available evidence.</p>
        </section>
      )}
    </div>
  );
}

const SWOT_QUADRANTS = [
  { label: "Strengths", tone: "bg-positive-wash", accent: "text-positive" },
  { label: "Weaknesses", tone: "bg-negative-wash", accent: "text-negative" },
  { label: "Opportunities", tone: "bg-brand-wash", accent: "text-brand" },
  { label: "Threats", tone: "bg-caution-wash", accent: "text-caution" },
] as const;

// Split a "Strengths: … Weaknesses: … Opportunities: … Threats: …" body into its
// four parts. Tolerant of ':' or '-' separators, line breaks, and bullet prefixes.
function parseSwot(body: string): Record<string, string> {
  const labels = SWOT_QUADRANTS.map((q) => q.label);
  const boundary = labels.join("|");
  const out: Record<string, string> = {};
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-–]\\s*([\\s\\S]*?)(?=(?:${boundary})\\s*[:\\-–]|$)`, "i");
    const m = body.match(re);
    if (m) out[label] = m[1].replace(/^[\s.;,·•-]+|[\s.;,]+$/g, "").trim();
  }
  return out;
}

function SwotGrid({ body }: { body: string }) {
  const parsed = parseSwot(body);
  // Fall back to plain text if we couldn't confidently split out the quadrants.
  const filled = SWOT_QUADRANTS.filter((q) => parsed[q.label]).length;
  if (filled < 2) return <p className="whitespace-pre-line text-[15px] leading-7 text-ink-soft">{body}</p>;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {SWOT_QUADRANTS.map((q) => (
        <div key={q.label} className={`rounded-xl p-4 ${q.tone}`}>
          <div className={`label ${q.accent}`}>{q.label}</div>
          <p className="mt-1 text-sm text-ink-soft">{parsed[q.label] ? asSentence(parsed[q.label]) : "Not disclosed."}</p>
        </div>
      ))}
    </div>
  );
}
