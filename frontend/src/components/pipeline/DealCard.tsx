"use client";

import { forwardRef, KeyboardEvent } from "react";
import { opportunityName, sourceLabel } from "@/lib/pipeline";
import { needsMe, waitedLong, waitingLabel } from "@/lib/pipelineBoard";
import { PipelineDeal } from "@/lib/types";
import { ArrowRightIcon } from "@/components/icons";

// One deal on the board. The whole card opens its preview (a second click opens
// the record); its next step is the one emphasized line.
export const DealCard = forwardRef<HTMLButtonElement, {
  d: PipelineDeal; selected: boolean; nextUp: boolean; onOpen: () => void; onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
}>(function DealCard({ d, selected, nextUp, onOpen, onKeyDown }, ref) {
  const founder = d.founder?.full_name;
  const long = waitedLong(d);
  return (
    <button
      ref={ref}
      type="button"
      data-deal={d.id}
      data-testid={`deal-card-${d.id}`}
      aria-current={selected ? "true" : undefined}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className={`card-interactive group block w-full rounded-xl border bg-white p-4 text-left focus-visible:outline-offset-2 ${selected ? "border-brand ring-1 ring-brand" : "border-line"}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[15px] font-semibold text-ink" data-content>{opportunityName(d)}</span>
        <span className="flex shrink-0 items-center gap-1">
          {nextUp && <span className="chip bg-brand-wash text-brand">Next Up</span>}
          {d.is_demo && <span className="chip bg-neutral-wash text-neutral">Demo</span>}
        </span>
      </span>
      {d.company?.one_liner && <span className="mt-0.5 block truncate text-meta text-ink-soft" data-content>{d.company.one_liner}</span>}
      <span className="mt-1 block truncate text-meta text-ink-muted">
        {founder ? <span data-content>{founder}</span> : d.company ? "Founder Not Linked Yet" : "No Company Yet"} · {sourceLabel(d.entry_type)}
      </span>

      {d.next_action ? (
        <span className={`mt-3 flex items-center gap-1.5 text-[14px] ${needsMe(d) ? "font-semibold text-ink" : "font-medium text-ink-soft"} group-hover:text-brand`}>
          {needsMe(d) && <span aria-label="Waiting on You" title="Waiting on You" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
          <span className="truncate">{d.next_action}</span>
          <ArrowRightIcon size={14} className="slide-arrow shrink-0" />
        </span>
      ) : <span className="mt-3 block text-[14px] text-ink-muted">Nothing Waiting</span>}

      <span className="mt-3 grid grid-cols-2 gap-3">
        <Measure label="Thesis Fit" value={d.company ? d.thesis_fit_score : null} empty="No Company" stale={d.thesis_fit_stale} />
        <Measure label="Founder Score" value={d.founder_score?.score ?? null} empty="Not Scored" />
      </span>

      <span className={`num mt-3 block text-meta ${long ? "font-medium text-caution" : "text-ink-muted"}`} data-testid="deal-waiting">
        {waitingLabel(d.age_days)}
      </span>
    </button>
  );
});

// A label, a short bar and the number: compact, and the number is always shown.
function Measure({ label, value, empty, stale = false }: { label: string; value: number | null; empty: string; stale?: boolean }) {
  return (
    <span className="block min-w-0">
      <span className="flex items-baseline justify-between gap-1 text-[12px] text-ink-muted">
        <span className="truncate">{label}</span>
        {value != null && <span className="num font-semibold text-ink">{Math.round(value)}</span>}
      </span>
      {value != null ? (
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <span className="block h-full origin-left rounded-full bg-brand" style={{ transform: `scaleX(${Math.max(0, Math.min(100, value)) / 100})` }} />
        </span>
      ) : <span className="mt-0.5 block text-[12px] text-ink-muted">{empty}</span>}
      {stale && <span className="mt-1 block text-[12px] font-medium text-caution">Stale</span>}
    </span>
  );
}
