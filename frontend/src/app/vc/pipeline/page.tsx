"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { humanStatus } from "@/lib/format";
import { NEXT_ACTION_LABELS, nextActionHref, opportunityName, parseNext, parseSource, parseStage, SourceFilter, sortDeals } from "@/lib/pipeline";
import { BoardFilters, boardOrder, DEAL_STAGES, ListSort, matchesFilters, sortList } from "@/lib/pipelineBoard";
import { PipelineDeal } from "@/lib/types";
import { Board } from "@/components/pipeline/Board";
import { DealPreview } from "@/components/pipeline/DealPreview";
import { PipelineTable } from "@/components/PipelineTable";
import { StageFlow } from "@/components/StageFlow";
import { EmptyState, ErrorState, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { ArrowRightIcon, CloseIcon, PipelineIcon, SearchIcon } from "@/components/icons";

export default function PipelinePage() {
  // useSearchParams (filters, view, the open deal) needs a Suspense boundary
  return (
    <Suspense fallback={<div className="space-y-8"><PageHeader title="Pipeline" /><BoardSkeleton /></div>}>
      <Pipeline />
    </Suspense>
  );
}

type View = "board" | "list";
const SORTS: ListSort[] = ["queue", "waiting", "fit", "score", "stage"];

function Pipeline() {
  const { data, loading, error, reload } = useFetch<{ items: PipelineDeal[] }>("/api/pipeline");
  // the Sourcing count and the thesis come from the Dashboard's summary
  const summary = useFetch<{ stage_counts: Record<string, number>; thesis: unknown | null }>("/api/dashboard");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // what other people (or another tab) changed shows up when you come back
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible") { reload(); summary.reload(); } };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => { window.removeEventListener("focus", again); document.removeEventListener("visibilitychange", again); };
  }, [reload, summary.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // everything lives in the URL, so refresh, Back and shared links keep it
  const view: View = params.get("view") === "list" ? "list" : "board";
  const filters: BoardFilters = { q: params.get("q") ?? "", source: parseSource(params.get("source")), mine: params.get("mine") === "1", next: parseNext(params.get("next")) };
  const stage = parseStage(params.get("stage"));
  const sort = (SORTS as string[]).includes(params.get("sort") ?? "") ? (params.get("sort") as ListSort) : "queue";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";
  const dealId = Number(params.get("deal")) || null;

  const set = useCallback((changes: Record<string, string | null>, push = false) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) (v == null || v === "" ? q.delete(k) : q.set(k, v));
    const url = q.size ? `${pathname}?${q}` : pathname;
    if (push) router.push(url, { scroll: false }); else router.replace(url, { scroll: false });
  }, [params, pathname, router]);

  const all = useMemo(() => sortDeals(data?.items ?? []), [data]);
  const matching = all.filter((d) => matchesFilters(d, filters) && (view === "board" || stage === "all" || d.stage === stage));

  // cards a filter removes fade out first; then the rest settle into place
  const key = JSON.stringify([filters, view === "list" ? stage : ""]);
  const [applied, setApplied] = useState(key);
  const [fading, setFading] = useState<Set<number>>(new Set());
  const [shownIds, setShownIds] = useState<Set<number> | null>(null);
  useEffect(() => {
    if (key === applied) return;
    const next = new Set(matching.map((d) => d.id));
    const leaving = new Set([...(shownIds ?? next)].filter((id) => !next.has(id)));
    if (!leaving.size) { setApplied(key); setShownIds(next); return; }
    setFading(leaving);
    const t = setTimeout(() => { setFading(new Set()); setApplied(key); setShownIds(next); }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { if (key === applied) setShownIds(new Set(matching.map((d) => d.id))); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = key === applied || !shownIds ? matching : all.filter((d) => shownIds.has(d.id));

  const ordered = view === "list" ? sortList(shown, sort, dir) : boardOrder(shown);
  // the header's one action is the deal the queue puts first; the board marks it Next Up
  const top = sortDeals(shown).find((d) => d.next_action);
  const open = all.find((d) => d.id === dealId) ?? null;

  function select(d: PipelineDeal) {
    // a second click on the open deal goes to its record
    if (dealId === d.id) { router.push(`/vc/opportunities/${d.id}`); return; }
    set({ deal: String(d.id) }, dealId == null);
  }
  const close = useCallback(() => set({ deal: null }), [set]);

  // with the preview open: J/K or Up/Down step through the deals, Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") { close(); return; }
      // a focused card handles its own arrow keys (and keeps the preview in step)
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && t.closest("[data-deal]")) return;
      const step = e.key === "j" || e.key === "ArrowDown" ? 1 : e.key === "k" || e.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      const i = ordered.findIndex((d) => d.id === open.id);
      const to = ordered[i + step];
      if (!to) return;
      e.preventDefault();
      set({ deal: String(to.id) });
      document.querySelector<HTMLElement>(`[data-deal="${to.id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, ordered, close, set]);

  const sourcing = summary.data?.stage_counts?.sourcing ?? 0;
  const counts = { sourcing, ...Object.fromEntries(DEAL_STAGES.map((s) => [s, all.filter((d) => d.stage === s).length])) };
  const waitingOnYou = all.filter((d) => d.next_action_key === "review_recommendation" || d.next_action_key === "review_application").length;

  const header = (
    <PageHeader
      title="Pipeline"
      subtitle={data ? `${all.length} Active ${all.length === 1 ? "Deal" : "Deals"}${waitingOnYou ? ` · ${waitingOnYou} Waiting on You` : ""}` : "Active Deals in Screening, Diligence and Decision"}
      actions={top && (
        <Link href={nextActionHref(top.id, top.next_action_key)} className="btn-primary group max-w-[22rem]" title={`${top.next_action} · ${opportunityName(top)}`} data-testid="pipeline-primary">
          <span className="truncate">{top.next_action}: <span data-content>{opportunityName(top)}</span></span>
          <ArrowRightIcon size={16} className="transition-transform duration-base ease-out group-hover:translate-x-0.5" />
        </Link>
      )}
    />
  );

  if (loading && !data) return <div className="space-y-8" role="status" aria-label="Loading Pipeline…">{header}<BoardSkeleton /></div>;
  if (error) return <div className="space-y-8">{header}<ErrorState message={`Couldn't load the pipeline: ${error}`} onRetry={reload} /></div>;
  if (!all.length) {
    const noThesis = summary.data && !summary.data.thesis;
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon={<PipelineIcon size={20} />}
          title="No Active Deals Yet"
          hint="Deals arrive here two ways: a founder applies through the founder portal, or you move a lead to Screening in Founders."
          action={noThesis
            ? <Link href="/vc/fund?edit=1" className="btn-primary">Create Thesis</Link>
            : <Link href="/vc/founders?source=open" className="btn-primary">Source Founders</Link>}
        />
      </div>
    );
  }

  const filtered = !!(filters.q || filters.source !== "all" || filters.mine || filters.next || (view === "list" && stage !== "all"));
  const chip = (on: boolean) => `press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-fast ${
    on ? "border-brand bg-brand text-white" : "border-line-strong bg-white text-ink-soft hover:border-ink-faint/60 hover:text-ink"}`;

  return (
    <div className="space-y-6">
      {header}

      {/* the four stages as one bar, as on the Dashboard */}
      <div data-print-hide>
        <StageFlow counts={counts} thin />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-3" data-print-hide>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search Deals</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input type="search" aria-label="Search Deals" placeholder="Search Company or Founder" className="input h-9 w-full pl-9"
            value={filters.q} onChange={(e) => set({ q: e.target.value })} />
        </label>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
          {(["inbound", "outbound"] as SourceFilter[]).map((s) => (
            <button key={s} type="button" aria-pressed={filters.source === s} className={chip(filters.source === s)} onClick={() => set({ source: filters.source === s ? null : s })}>{humanStatus(s)}</button>
          ))}
          <button type="button" aria-pressed={filters.mine} className={chip(filters.mine)} onClick={() => set({ mine: filters.mine ? null : "1" })}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${filters.mine ? "bg-white" : "bg-brand"}`} />Needs Me
          </button>
          {filters.next && (
            <button type="button" className="chip-button h-8 bg-brand-wash px-3 text-[13px] text-brand hover:bg-brand/15" onClick={() => set({ next: null })} aria-label={`Remove Filter: ${NEXT_ACTION_LABELS[filters.next]}`}>
              {NEXT_ACTION_LABELS[filters.next]} <CloseIcon size={12} />
            </button>
          )}
          {view === "list" && stage !== "all" && (
            <button type="button" className="chip-button h-8 bg-brand-wash px-3 text-[13px] text-brand hover:bg-brand/15" onClick={() => set({ stage: null })} aria-label={`Remove Filter: ${humanStatus(stage)}`}>
              {humanStatus(stage)} <CloseIcon size={12} />
            </button>
          )}
        </div>
        <span className="text-[13px] text-ink-muted" aria-live="polite" data-testid="pipeline-showing">{filtered ? `Showing ${shown.length} of ${all.length}` : ""}</span>
        <div className="ml-auto">
          <Segmented<View> size="sm" label="View" value={view} onChange={(v) => set({ view: v === "list" ? "list" : null })}
            options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} />
        </div>
      </div>

      <div key={view} className="animate-fade" data-print-hide>
        {shown.length === 0 ? (
          <EmptyState title="No Deals Match These Filters" action={<button className="btn-secondary" onClick={() => set({ q: null, source: null, mine: null, next: null, stage: null })}>Clear Filters</button>} />
        ) : view === "board" ? (
          <FadeOut ids={fading}>
            <Board deals={shown} sourcing={sourcing} selected={open?.id ?? null} nextUpId={top?.id ?? null} focusStage={stage === "all" ? null : stage} onSelect={select} />
          </FadeOut>
        ) : (
          <FadeOut ids={fading}>
            <PipelineTable deals={ordered} sort={sort} dir={dir} selected={open?.id ?? null} onSelect={select}
              onSort={(by) => set(by === sort ? { dir: dir === "desc" ? "asc" : null } : { sort: by, dir: null })} />
          </FadeOut>
        )}
      </div>

      {/* print: every deal, by stage */}
      <section className="hidden print:block" aria-label="Deals by Stage">
        {DEAL_STAGES.map((s) => (
          <div key={s} className="mb-4">
            <h2 className="text-section text-ink">{humanStatus(s)} · {all.filter((d) => d.stage === s).length}</h2>
            <ul className="mt-1 text-[13px] text-ink-soft">
              {all.filter((d) => d.stage === s).map((d) => (
                <li key={d.id}><span data-content>{opportunityName(d)}</span> · {d.next_action ?? "Nothing Waiting"} · Fit {d.company ? Math.round(d.thesis_fit_score) : "—"} · Score {d.founder_score ? Math.round(d.founder_score.score) : "—"}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <DealPreview deal={open} onClose={close} />
    </div>
  );
}

// cards and rows a filter is about to remove fade out before the rest settle
function FadeOut({ ids, children }: { ids: Set<number>; children: React.ReactNode }) {
  return (
    <div className="contents">
      <style>{[...ids].map((id) => `[data-deal="${id}"],[data-testid="deal-row-${id}"],[data-testid="deal-item-${id}"]{opacity:0;transform:scale(.97);transition:opacity 160ms,transform 160ms}`).join("")}</style>
      {children}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="flex gap-4 overflow-hidden">
        <Skeleton className="h-28 w-44 shrink-0 rounded-xl" />
        {[0, 1, 2].map((c) => (
          <div key={c} className="w-[85%] shrink-0 space-y-3 sm:w-[20rem] xl:w-auto xl:flex-1">
            <Skeleton className="h-5 w-32" />
            {[0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ))}
      </div>
    </div>
  );
}
