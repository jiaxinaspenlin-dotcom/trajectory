"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { humanStatus } from "@/lib/format";
import { filterDeals, nextActionHref, opportunityName, parseSource, parseStage, PIPELINE_STAGES, SourceFilter, stageDot } from "@/lib/pipeline";
import { PipelineDeal } from "@/lib/types";
import { PipelineTable } from "@/components/PipelineTable";
import { EmptyState, ErrorState, PageHeader, Segmented, Spinner, Toolbar } from "@/components/ui";

const STAGE_HINT: Record<string, string> = {
  all: "Every active deal",
  screening: "New applications and moved-in leads",
  diligence: "Analyzed; checking claims",
  decision: "Ready for an invest / pass call",
};

export default function PipelinePage() {
  return (
    <Suspense fallback={<Spinner label="Loading pipeline…" />}>
      <Deals />
    </Suspense>
  );
}

function Deals() {
  const { data, loading, error, reload } = useFetch<{ items: PipelineDeal[] }>("/api/pipeline");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // filters live in the URL so a refresh or shared link keeps them
  const stage = parseStage(params.get("stage"));
  const source = parseSource(params.get("source"));

  function setFilter(key: "stage" | "source", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const all = data?.items ?? [];
  const actNow = all.filter((d) => d.priority === 1).length;
  const top = [...all].filter((d) => d.next_action).sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || b.age_days - a.age_days)[0];
  const header = (
    <PageHeader
      title="Pipeline"
      subtitle={data
        ? `${all.length} active ${all.length === 1 ? "deal" : "deals"} in Screening, Diligence, and Decision${actNow ? ` · ${actNow} ${actNow === 1 ? "recommendation" : "recommendations"} awaiting your review` : ""}`
        : "Active deals in Screening, Diligence, and Decision"}
      actions={top && (
        // the one primary action: the most urgent deal's next step
        <Link href={nextActionHref(top.id, top.next_action_key)} className="btn-primary max-w-[22rem]" title={`${top.next_action} · ${opportunityName(top)}`}>
          <span className="truncate">{top.next_action}: {opportunityName(top)}</span>
        </Link>
      )}
    />
  );

  if (loading && !data) return <div className="space-y-4">{header}<Spinner label="Loading pipeline…" /></div>;
  if (error) return <div className="space-y-4">{header}<ErrorState message={`Couldn't load the pipeline: ${error}`} onRetry={reload} /></div>;
  if (!all.length) {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState
          title="No active deals yet"
          hint="Inbound applications land here at Screening. Outbound founders join once you move them to Screening from Founders."
          action={<><Link href="/vc/founders" className="btn-primary">Go to Founders</Link><Link href="/vc/founders?source=open" className="btn-secondary">Source founders</Link></>}
        />
      </div>
    );
  }

  // stage counts respect the source filter, and vice versa
  const stageCount = (s: string) => filterDeals(all, s, source).length;
  const sourceCount = (s: SourceFilter) => filterDeals(all, stage, s).length;
  const shown = filterDeals(all, stage, source);

  return (
    <div className="space-y-4">
      {header}

      {/* stage funnel: the stage filter — each cell says what the stage means */}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-white sm:grid-cols-4" role="group" aria-label="Filter by stage">
        {(["all", ...PIPELINE_STAGES] as const).map((s, i) => {
          const active = stage === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter("stage", s)}
              className={`px-4 py-3 text-left transition-colors ${i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""} ${
                active ? "bg-brand-wash shadow-[inset_0_-2px_0_#1f4fd8]" : "hover:bg-surface-sunken"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[15px] font-medium text-ink">
                  {s !== "all" && <span className={`h-2 w-2 rounded-full ${stageDot(s)}`} aria-hidden />}
                  {s === "all" ? "All stages" : humanStatus(s)}
                </span>
                <span className="num text-2xl font-semibold text-ink">{stageCount(s)}</span>
              </span>
              <span className="mt-0.5 block text-[13px] text-ink-muted">{STAGE_HINT[s]}</span>
            </button>
          );
        })}
      </div>

      <Toolbar>
        <span className="text-sm font-medium text-ink-soft">Source</span>
        <Segmented<SourceFilter>
          label="Filter by source"
          value={source}
          onChange={(v) => setFilter("source", v)}
          options={[
            { value: "all", label: <>All <span className="opacity-60">{sourceCount("all")}</span></> },
            { value: "inbound", label: <>Inbound <span className="opacity-60">{sourceCount("inbound")}</span></> },
            { value: "outbound", label: <>Outbound <span className="opacity-60">{sourceCount("outbound")}</span></> },
          ]}
        />
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted" aria-live="polite">
          <span data-testid="pipeline-showing">
            Showing {shown.length} of {all.length}
            {stage !== "all" && <> · {humanStatus(stage)}</>}
            {source !== "all" && <> · {humanStatus(source)}</>}
          </span>
          {(stage !== "all" || source !== "all") && (
            <button className="btn-ghost btn-sm" onClick={() => router.replace(pathname, { scroll: false })}>Clear filters</button>
          )}
          {loading && <Spinner label="Refreshing…" />}
        </span>
      </Toolbar>

      {shown.length ? (
        <>
          <PipelineTable deals={shown} />
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" /> Awaiting your review · Thesis fit is 0–100 against your Fund thesis · Waiting counts days since the first signal
          </p>
        </>
      ) : (
        <EmptyState
          title="No deals match these filters"
          action={<button className="btn-secondary" onClick={() => router.replace(pathname, { scroll: false })}>Clear filters</button>}
        />
      )}
    </div>
  );
}
