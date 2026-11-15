"use client";

import { Memo } from "@/lib/types";
import { normalizeMemoSections } from "@/lib/memo";
import { Badge, Section } from "@/components/ui";

// Renders the full evidence-backed investment memo — the final recommendation
// plus every standard section, in order. Missing data is labeled, never invented.
// Shared by the inline Arena dropdown and the print-friendly memo page.
export function MemoView({ memo }: { memo: Memo }) {
  const sections = normalizeMemoSections(memo);
  return (
    <div className="space-y-4">
      {memo.recommended_action && (
        <div className="rounded-xl bg-brand-wash p-4">
          <span className="label text-brand">Final Recommendation</span>
          <p className="text-lg font-semibold text-brand">{memo.recommended_action}</p>
          <p className="text-xs text-ink-muted">Confidence {Math.round(memo.confidence * 100)}%</p>
        </div>
      )}
      {sections.map((s) => (
        <Section
          key={s.key}
          title={s.title}
          right={s.unavailable_label ? <Badge tone="bg-neutral-wash text-neutral">{s.unavailable_label}</Badge> : undefined}
        >
          {s.key === "swot" ? (
            <SwotGrid body={s.body} />
          ) : (
            <p className="whitespace-pre-line text-sm text-ink-soft">{s.body}</p>
          )}
          {s.evidence_ids.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Evidence:{" "}
              {s.evidence_ids.map((e) => (
                <span key={e} className="mr-1 rounded bg-surface-sunken px-1 font-mono">E{e}</span>
              ))}
            </p>
          )}
        </Section>
      ))}
    </div>
  );
}

const SWOT_QUADRANTS = [
  { label: "Strengths", tone: "border-positive/30 bg-positive-wash", accent: "text-positive" },
  { label: "Weaknesses", tone: "border-negative/30 bg-negative-wash", accent: "text-negative" },
  { label: "Opportunities", tone: "border-brand/30 bg-brand-wash", accent: "text-brand" },
  { label: "Threats", tone: "border-caution/40 bg-caution-wash", accent: "text-caution" },
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
  if (filled < 2) return <p className="whitespace-pre-line text-sm text-ink-soft">{body}</p>;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SWOT_QUADRANTS.map((q) => (
        <div key={q.label} className={`rounded-lg border p-3 ${q.tone}`}>
          <div className={`label ${q.accent}`}>{q.label}</div>
          <p className="mt-1 text-sm text-ink-soft">{parsed[q.label] || "Not disclosed."}</p>
        </div>
      ))}
    </div>
  );
}
