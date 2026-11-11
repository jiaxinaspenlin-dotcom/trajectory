"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { humanStatus } from "@/lib/format";
import {
  filterDeals, parseSource, parseStage, PIPELINE_STAGES, SourceFilter,
} from "@/lib/pipeline";
import { PipelineDeal } from "@/lib/types";
import { PipelineTable } from "@/components/PipelineTable";
import { EmptyState, ErrorState, PageHeader, Section, Segmented, Spinner } from "@/components/ui";

export default function PipelinePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline"
        title="Active deals"
        subtitle="Every opportunity in Screening, Diligence, or Decision — inbound applications and outbound founders you've moved forward, in one workflow."
        actions={<Link href="/vc/founders" className="btn-primary">+ Source founders</Link>}
      />
      {/* useSearchParams needs a Suspense boundary for static rendering */}
      <Suspense fallback={<Spinner label="Loading pipeline…" />}>
        <Deals />
      </Suspense>
    </div>
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

  if (loading && !data) return <Spinner label="Loading pipeline…" />;
  if (error) {
    return (
      <Section title="Deals">
        <ErrorState message={`Couldn't load the pipeline: ${error}`} />
        <button className="btn-secondary mt-3" onClick={reload}>Retry</button>
      </Section>
    );
  }
  const all = data?.items ?? [];
  if (!all.length) {
    return (
      <EmptyState
        title="No active deals yet"
        hint="Inbound applications land here at Screening. Outbound founders join once you move them to Screening from Founders."
        action={<Link href="/vc/founders" className="btn-primary">Go to Founders</Link>}
      />
    );
  }

  // stage counts respect the source filter, and vice versa
  const stageCount = (s: string) => filterDeals(all, s, source).length;
  const sourceCount = (s: SourceFilter) => filterDeals(all, stage, s).length;
  const shown = filterDeals(all, stage, source);

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="label">Filter deals</span>
        <Segmented
          label="Filter by stage"
          value={stage}
          onChange={(v) => setFilter("stage", v)}
          options={[
            { value: "all", label: `All stages ${stageCount("all")}` },
            ...PIPELINE_STAGES.map((s) => ({ value: s, label: `${humanStatus(s)} ${stageCount(s)}` })),
          ]}
        />
        <Segmented<SourceFilter>
          label="Filter by source"
          value={source}
          onChange={(v) => setFilter("source", v)}
          options={[
            { value: "all", label: `All sources ${sourceCount("all")}` },
            { value: "inbound", label: `Inbound ${sourceCount("inbound")}` },
            { value: "outbound", label: `Outbound ${sourceCount("outbound")}` },
          ]}
        />
        {loading && <Spinner label="Refreshing…" />}
      </div>
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
