"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useFetch } from "@/lib/useFetch";
import { humanStatus, momentumWindow, signedPoints, sourceName } from "@/lib/format";
import { decisionReasons } from "@/lib/decision";
import { evidenceHref, nextActionHref, opportunityName, sourceLabel } from "@/lib/pipeline";
import { needsMe, waitingLabel } from "@/lib/pipelineBoard";
import { usePresence } from "@/lib/motion";
import { Opportunity, PipelineDeal } from "@/lib/types";
import { DemoBadge, Meter, Skeleton } from "@/components/ui";
import { StageBadge } from "@/components/DealBadges";
import { ArrowRightIcon, CloseIcon } from "@/components/icons";

// A look into a deal without leaving the board: a side panel (a bottom sheet on
// phones) that doesn't block the board, so another card can be opened from it.
export function DealPreview({ deal, onClose }: { deal: PipelineDeal | null; onClose: () => void }) {
  const { mounted, state } = usePresence(!!deal, 220);
  const last = useRef<PipelineDeal | null>(deal);
  if (deal) last.current = deal;
  const d = deal ?? last.current;
  const panel = useRef<HTMLElement>(null);
  // the panel takes focus when it opens (not on every switch, so J/K keeps going)
  const open = !!deal;
  useEffect(() => { if (open) panel.current?.focus({ preventScroll: true }); }, [open]);
  if (!mounted || !d) return null;
  return (
    <aside ref={panel} tabIndex={-1} aria-labelledby="preview-title" data-testid="deal-preview" data-print-hide
      className={`drawer-${state} sheet-on-phone fixed inset-x-0 bottom-0 z-40 flex max-h-[80dvh] flex-col rounded-t-2xl border-t border-line bg-white shadow-overlay focus:outline-none sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-0 sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-l sm:border-t-0`}>
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
      <Body key={d.id} d={d} onClose={onClose} />
    </aside>
  );
}

function Body({ d, onClose }: { d: PipelineDeal; onClose: () => void }) {
  const detail = useFetch<Opportunity>(`/api/opportunities/${d.id}`);
  const o = detail.data;
  const rec = o?.current_recommendation ?? null;
  const reason = o && rec ? decisionReasons(o, rec.action).reasons[0] : null;
  const evidence = o ? [...(o.evidence ?? o.founder?.evidence ?? [])].sort((a, b) => (b.collected_at ?? "").localeCompare(a.collected_at ?? "")).slice(0, 3) : [];
  const m = d.momentum;
  const base = `/vc/opportunities/${d.id}`;
  return (
    <div className="animate-fade flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-4 sm:pt-6">
        <div className="min-w-0">
          <h2 id="preview-title" className="truncate text-title text-ink" data-content>{opportunityName(d)}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-ink-muted">
            <StageBadge stage={d.stage} />{sourceLabel(d.entry_type)}{d.is_demo && <DemoBadge />}
          </p>
        </div>
        <button type="button" className="icon-btn -mr-2" onClick={onClose} aria-label="Close Preview"><CloseIcon /></button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6">
        {d.next_action && (
          <div>
            <Link href={nextActionHref(d.id, d.next_action_key)} className="btn-primary group w-full justify-between">
              <span className="flex items-center gap-2">{needsMe(d) && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />}{d.next_action}</span>
              <ArrowRightIcon size={16} className="transition-transform duration-base ease-out group-hover:translate-x-0.5" />
            </Link>
            <p className="num mt-1.5 text-meta text-ink-muted">{waitingLabel(d.age_days)}{d.next_action_detail ? ` · ${d.next_action_detail}` : ""}</p>
          </div>
        )}

        <section aria-label="Recommendation">
          <p className="label">Recommendation</p>
          {detail.loading && !o ? <Skeleton className="mt-2 h-10 w-full" />
            : rec ? (
              <>
                <p className="mt-1 text-section text-ink">{humanStatus(rec.action)} <span className="num text-meta font-normal text-ink-muted">· {Math.round(rec.confidence * 100)}% Confidence</span></p>
                {reason && <p className="mt-1 text-[14px] text-ink-soft"><span data-content>{reason.text}</span>{reason.unverified && <span className="chip ml-2 bg-caution-wash text-caution">Unverified</span>}</p>}
              </>
            ) : <p className="mt-1 text-[14px] text-ink-muted">No recommendation yet.</p>}
        </section>

        <section aria-label="Scores" className="grid grid-cols-2 gap-4">
          <div>
            <p className="flex items-baseline justify-between text-meta text-ink-muted">Thesis Fit<span className="num text-[15px] font-semibold text-ink">{d.company ? Math.round(d.thesis_fit_score) : "—"}</span></p>
            {d.company ? <div className="mt-1.5"><Meter value={d.thesis_fit_score / 100} label={`Thesis Fit ${Math.round(d.thesis_fit_score)} of 100`} /></div> : <p className="text-meta text-ink-muted">Needs a Company</p>}
            {d.thesis_fit_stale && <p className="mt-1 text-meta font-medium text-caution">Stale: Scored Against an Older Thesis</p>}
          </div>
          <div>
            <p className="flex items-baseline justify-between text-meta text-ink-muted">Founder Score<span className="num text-[15px] font-semibold text-ink">{d.founder_score ? Math.round(d.founder_score.score) : "—"}</span></p>
            {d.founder_score ? <div className="mt-1.5"><Meter value={d.founder_score.score / 100} label={`Founder Score ${Math.round(d.founder_score.score)} of 100`} /></div> : <p className="text-meta text-ink-muted">Not Scored</p>}
            {m?.change_30d != null && (
              <p className="num mt-1 text-meta text-ink-muted">Momentum {signedPoints(m.change_30d)} / {momentumWindow(m.change_30d_window_days).short} · {humanStatus(m.trajectory)}</p>
            )}
          </div>
        </section>

        <section aria-label="Latest Evidence">
          <p className="label">Latest Evidence</p>
          {detail.loading && !o ? <div className="mt-2 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>
            : evidence.length ? (
              <ul className="mt-1 divide-y divide-line">
                {evidence.map((e) => (
                  <li key={e.id}>
                    <Link href={evidenceHref(d.id, e.id)} className="row-interactive -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 text-[14px]">
                      <span className="min-w-0 truncate text-ink" data-content>{e.title}</span>
                      <span className="shrink-0 truncate text-meta text-ink-muted sm:max-w-[9rem]" data-content>{sourceName(e.source_name)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-[14px] text-ink-muted">No evidence yet.</p>}
        </section>

        <nav aria-label="Go To" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-[14px]">
          <Link href={base} className="link">Open Record</Link>
          <Link href={`${base}/memo`} className="link">Memo</Link>
          <Link href={`${base}/diligence`} className="link">Diligence</Link>
        </nav>
        <p className="hidden text-meta text-ink-muted sm:block">J and K (or the arrow keys) move to the next deal; Escape closes.</p>
      </div>
    </div>
  );
}
