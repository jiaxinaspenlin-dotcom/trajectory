"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { humanStatus } from "@/lib/format";
import {
  filterDeals, NEXT_ACTION_LABELS, nextActionHref, opportunityName, parseNext, parseSource, parseStage, PIPELINE_STAGES, SourceFilter, sortDeals,
} from "@/lib/pipeline";
import { PipelineDeal } from "@/lib/types";
import { PipelineTable } from "@/components/PipelineTable";
import { EmptyState, ErrorState, PageHeader, PageSkeleton, Segmented } from "@/components/ui";
import { ArrowRightIcon, CloseIcon, PipelineIcon } from "@/components/icons";

export default function PipelinePage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading Pipeline…" />}>
      <Deals />
    </Suspense>
  );
}

type Stage = "all" | (typeof PIPELINE_STAGES)[number];

function Deals() {
  const { data, loading, error, reload } = useFetch<{ items: PipelineDeal[] }>("/api/pipeline");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // filters live in the URL so a refresh or shared link keeps them
  const stage = parseStage(params.get("stage")) as Stage;
  const source = parseSource(params.get("source"));
  const next = parseNext(params.get("next"));

  function setFilter(key: "stage" | "source" | "next", value: string) {
    const q = new URLSearchParams(params.toString());
    if (value === "all") q.delete(key);
    else q.set(key, value);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const all = sortDeals(data?.items ?? []);
  const byNext = (d: PipelineDeal) => !next || d.next_action_key === next;
  const shown = filterDeals(all, stage, source).filter(byNext);
  // the one primary action is the first row's next step: what the table puts on top
  const top = shown.find((d) => d.next_action);
  const actNow = all.filter((d) => d.priority === 1).length;

  const header = (
    <PageHeader
      title="Pipeline"
      subtitle={data
        ? `${all.length} Active ${all.length === 1 ? "Deal" : "Deals"}${actNow ? ` · ${actNow} Awaiting Your Review` : ""}`
        : "Active Deals in Screening, Diligence and Decision"}
      actions={top && (
        <Link href={nextActionHref(top.id, top.next_action_key)} className="btn-primary group max-w-[22rem]" title={`${top.next_action} · ${opportunityName(top)}`}>
          <span className="truncate">{top.next_action}: <span data-content>{opportunityName(top)}</span></span>
          <ArrowRightIcon size={16} className="transition-transform duration-base ease-out group-hover:translate-x-0.5" />
        </Link>
      )}
    />
  );

  if (loading && !data) return <PageSkeleton label="Loading Pipeline…" />;
  if (error) return <div className="space-y-8">{header}<ErrorState message={`Couldn't load the pipeline: ${error}`} onRetry={reload} /></div>;
  if (!all.length) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon={<PipelineIcon size={20} />}
          title="No Active Deals Yet"
          hint="Inbound applications land here at Screening. Outbound founders join once you move them to Screening from Founders."
          action={<Link href="/vc/founders" className="btn-primary">Go to Founders</Link>}
        />
      </div>
    );
  }

  // stage counts respect the other filters, and vice versa
  const stageCount = (s: string) => filterDeals(all, s, source).filter(byNext).length;
  const sourceCount = (s: SourceFilter) => filterDeals(all, stage, s).filter(byNext).length;
  const filtered = stage !== "all" || source !== "all" || !!next;

  return (
    <div className="space-y-8">
      {header}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Segmented<Stage>
          label="Filter by Stage"
          value={stage}
          onChange={(v) => setFilter("stage", v)}
          options={(["all", ...PIPELINE_STAGES] as Stage[]).map((s) => ({
            value: s,
            label: <>{s === "all" ? <>All<span className="hidden sm:inline"> Stages</span></> : humanStatus(s)} <span className="ml-0.5 text-ink-faint sm:ml-1">{stageCount(s)}</span></>,
          }))}
        />
        <Segmented<SourceFilter>
          size="sm"
          label="Filter by Source"
          value={source}
          onChange={(v) => setFilter("source", v)}
          options={(["all", "inbound", "outbound"] as SourceFilter[]).map((s) => ({
            value: s,
            label: <>{s === "all" ? "Any Source" : humanStatus(s)} <span className="ml-1 text-ink-faint">{sourceCount(s)}</span></>,
          }))}
        />
        {next && (
          <button type="button" className="chip-button h-8 bg-brand-wash px-3 text-[13px] text-brand hover:bg-brand/15" onClick={() => setFilter("next", "all")} aria-label={`Remove Filter: ${NEXT_ACTION_LABELS[next]}`}>
            {NEXT_ACTION_LABELS[next]} <CloseIcon size={12} />
          </button>
        )}
        <span className="ml-auto text-[13px] text-ink-muted" aria-live="polite">
          <span data-testid="pipeline-showing">Showing {shown.length} of {all.length}</span>
          {loading && <span className="spinner ml-2 h-3 w-3 align-[-2px] text-brand" aria-label="Refreshing" />}
        </span>
      </div>

      {shown.length ? (
        <PipelineTable deals={shown} />
      ) : (
        <EmptyState
          title="No Deals Match These Filters"
          action={filtered ? <button className="btn-secondary" onClick={() => router.replace(pathname, { scroll: false })}>Clear Filters</button> : undefined}
        />
      )}
    </div>
  );
}
