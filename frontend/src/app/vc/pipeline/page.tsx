"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { humanStatus } from "@/lib/format";
import { filterDeals, parseSource, parseStage, PIPELINE_STAGES, SourceFilter, stageDot } from "@/lib/pipeline";
import { PipelineDeal } from "@/lib/types";
import { PipelineTable } from "@/components/PipelineTable";
import { EmptyState, ErrorState, PageHeader, Segmented, Spinner, Toolbar } from "@/components/ui";

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
  const header = (
    <PageHeader
      title="Pipeline"
      subtitle={data ? `${all.length} active deals · ${actNow} need a decision now` : "Active deals in Screening, Diligence, and Decision"}
      actions={<Link href="/vc/founders?source=open" className="btn-primary">+ Source founders</Link>}
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
          action={<Link href="/vc/founders" className="btn-primary">Go to Founders</Link>}
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

      {/* stage funnel: each segment filters the table */}
      <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-line bg-white" role="group" aria-label="Deals by stage">
        {PIPELINE_STAGES.map((s, i) => {
          const active = stage === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter("stage", active ? "all" : s)}
              className={`px-4 py-2.5 text-left transition-colors ${i > 0 ? "border-l border-line" : ""} ${active ? "bg-brand-wash" : "hover:bg-surface-sunken"}`}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <span className={`h-2 w-2 rounded-full ${stageDot(s)}`} aria-hidden />
                {humanStatus(s)}
              </span>
              <span className="num mt-0.5 block text-xl font-semibold text-ink">{stageCount(s)}</span>
            </button>
          );
        })}
      </div>

      <Toolbar>
        <Segmented
          label="Filter by stage"
          value={stage}
          onChange={(v) => setFilter("stage", v)}
          options={[
            { value: "all", label: <>All stages <span className="opacity-60">{stageCount("all")}</span></> },
            ...PIPELINE_STAGES.map((s) => ({ value: s, label: <>{humanStatus(s)} <span className="opacity-60">{stageCount(s)}</span></> })),
          ]}
        />
        <Segmented<SourceFilter>
          label="Filter by source"
          value={source}
          onChange={(v) => setFilter("source", v)}
          options={[
            { value: "all", label: <>All sources <span className="opacity-60">{sourceCount("all")}</span></> },
            { value: "inbound", label: <>Inbound <span className="opacity-60">{sourceCount("inbound")}</span></> },
            { value: "outbound", label: <>Outbound <span className="opacity-60">{sourceCount("outbound")}</span></> },
          ]}
        />
        {loading && <Spinner label="Refreshing…" />}
      </Toolbar>

      {shown.length ? (
        <PipelineTable deals={shown} />
      ) : (
        <EmptyState
          title="No deals match these filters"
          action={<button className="btn-secondary" onClick={() => router.replace(pathname, { scroll: false })}>Clear filters</button>}
        />
      )}
    </div>
  );
}
