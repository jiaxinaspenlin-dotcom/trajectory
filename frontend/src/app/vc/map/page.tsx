"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import {
  filterNodes, hasWebGL, MapKind, MapSource, MapState, mapStateToQuery, MapView,
  matchesSearch, parseMapState, partitionForPlot, STAGE_COLORS,
} from "@/lib/opportunityMap";
import { MapData } from "@/lib/types";
import { EmptyState, ErrorState, PageHeader, Section, Segmented, Spinner } from "@/components/ui";
import { FitMomentumScatter } from "@/components/map/FitMomentumScatter";
import { MapList } from "@/components/map/MapList";
import { MapNodePanel } from "@/components/map/MapNodePanel";

// Three.js only runs in the browser; keep it out of the server render and other routes.
const RelationshipGraph = dynamic(
  () => import("@/components/map/RelationshipGraph").then((m) => m.RelationshipGraph),
  { ssr: false, loading: () => <div className="p-4"><Spinner label="Starting the map…" /></div> }
);

export default function MapPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Map"
        title="Opportunity map"
        subtitle="The same founders and deals as Founders and Pipeline — grouped by sector or project, linked only where a relationship can be named, and plotted on thesis fit against founder momentum."
        actions={<Link href="/vc/founders" className="btn-primary">+ Source founders</Link>}
      />
      {/* useSearchParams needs a Suspense boundary for static rendering */}
      <Suspense fallback={<Spinner label="Loading map…" />}>
        <OpportunityMap />
      </Suspense>
    </div>
  );
}

function OpportunityMap() {
  const { data, loading, error, reload } = useFetch<MapData>("/api/map");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = parseMapState(new URLSearchParams(params.toString()));
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [layout, setLayout] = useState<"graph" | "list">("graph");
  const [q, setQ] = useState(state.q);
  useEffect(() => setWebgl(hasWebGL()), []);

  const update = useCallback(
    (patch: Partial<MapState>) => {
      const next = parseMapState(new URLSearchParams(window.location.search));
      const qs = mapStateToQuery({ ...next, ...patch });
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router]
  );
  const select = useCallback((id: number | null) => update({ focus: id }), [update]);
  const onUnavailable = useCallback(() => setWebgl(false), []);

  const all = data?.items;
  const nodes = useMemo(() => (all ? filterNodes(all, state) : []), [all, state.source, state.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const links = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return (data?.links ?? []).filter((l) => ids.has(l.source) && ids.has(l.target));
  }, [data, nodes]);
  const plottedIds = useMemo(() => new Set(partitionForPlot(nodes).plotted.map((p) => p.id)), [nodes]);

  if (loading && !data) return <Spinner label="Loading map…" />;
  if (error) {
    return (
      <Section title="Map">
        <ErrorState message={`Couldn't load the map: ${error}`} />
        <button className="btn-secondary mt-3" onClick={reload}>Retry</button>
      </Section>
    );
  }
  if (!all?.length) {
    return (
      <EmptyState
        title="Nothing to map yet"
        hint="Founder leads and active deals appear here once you source founders or receive an application."
        action={<Link href="/vc/founders" className="btn-primary">Go to Founders</Link>}
      />
    );
  }

  const byId = new Map(all.map((n) => [n.id, n]));
  const selected = state.focus != null ? byId.get(state.focus) ?? null : null;
  const visibleIds = new Set(nodes.map((n) => n.id));
  const matches = q.trim() ? nodes.filter((n) => matchesSearch(n, q)) : [];

  return (
    <div className="space-y-3">
      {/* toolbar: view toggle, search, filters — all mirrored in the URL */}
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <Segmented<MapView>
          label="Map view"
          value={state.view}
          onChange={(v) => update({ view: v })}
          options={[{ value: "graph", label: "Relationship map" }, { value: "axes", label: "Thesis fit × Momentum" }]}
        />
        <div className="relative">
          <input
            type="search"
            aria-label="Search the map"
            placeholder="Search founder, company, topic"
            className="w-64 rounded-lg border border-line bg-white px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
            value={q}
            onChange={(e) => { setQ(e.target.value); update({ q: e.target.value }); }}
            onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) select(matches[0].id); }}
          />
          {q.trim() && (
            <ul className="absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-white shadow-raised" aria-label="Search results">
              {matches.length ? matches.slice(0, 6).map((n) => (
                <li key={n.id}>
                  <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-sunken" onClick={() => { select(n.id); setQ(""); update({ q: "", focus: n.id }); }}>
                    <span className="font-medium text-ink">{n.name}</span>
                    <span className="ml-1 text-xs text-ink-muted">{n.group.label}</span>
                  </button>
                </li>
              )) : <li className="px-3 py-1.5 text-xs text-ink-muted">No matches in the current filters</li>}
            </ul>
          )}
        </div>
        <Segmented<MapKind>
          label="Filter by record type"
          value={state.kind}
          onChange={(v) => update({ kind: v })}
          options={[
            { value: "all", label: "All" },
            { value: "lead", label: `Leads ${all.filter((n) => n.kind === "lead").length}` },
            { value: "deal", label: `Deals ${all.filter((n) => n.kind === "deal").length}` },
          ]}
        />
        <Segmented<MapSource>
          label="Filter by source"
          value={state.source}
          onChange={(v) => update({ source: v })}
          options={[{ value: "all", label: "All sources" }, { value: "inbound", label: "Inbound" }, { value: "outbound", label: "Outbound" }]}
        />
        <span className="text-xs text-ink-muted">{nodes.length} of {all.length} shown</span>
        {loading && <Spinner label="Refreshing…" />}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card min-w-0 overflow-hidden">
          {state.view === "graph" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
                <Legend />
                {webgl && (
                  <Segmented<"graph" | "list">
                    label="Map layout"
                    value={layout}
                    onChange={setLayout}
                    options={[{ value: "graph", label: "Graph" }, { value: "list", label: "List" }]}
                  />
                )}
              </div>
              {webgl === false && (
                <p className="border-b border-line bg-caution-wash px-4 py-2 text-xs text-caution" role="status">
                  WebGL isn&apos;t available in this browser, so the map is shown as a grouped list.
                </p>
              )}
              {!nodes.length ? (
                <p className="p-6 text-sm text-ink-muted">No opportunities match these filters.</p>
              ) : webgl && layout === "graph" ? (
                <div className="h-[560px]">
                  <RelationshipGraph nodes={nodes} links={links} selectedId={state.focus} query={q} onSelect={select} onUnavailable={onUnavailable} />
                </div>
              ) : webgl === null ? (
                <div className="p-4"><Spinner label="Starting the map…" /></div>
              ) : (
                <div className="max-h-[560px] overflow-y-auto">
                  <MapList nodes={nodes} selectedId={state.focus} query={q} onSelect={select} />
                </div>
              )}
              <p className="border-t border-line px-4 py-2 text-[11px] text-ink-muted">
                Drag to pan · scroll or pinch to zoom · click a node to select. Lines show group membership (grey) and named relationships: shared GitHub repo topics (amber), same founder or company (violet).
              </p>
            </>
          ) : (
            <div className="p-4">
              {nodes.length ? <FitMomentumScatter nodes={nodes} selectedId={state.focus} query={q} onSelect={select} /> : <p className="text-sm text-ink-muted">No opportunities match these filters.</p>}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {selected ? (
            <MapNodePanel
              node={selected}
              links={data!.links}
              nodesById={byId}
              hiddenByFilters={!visibleIds.has(selected.id)}
              plotted={plottedIds.has(selected.id)}
              view={state.view}
              onSelect={select}
              onClose={() => select(null)}
            />
          ) : (
            <div className="card p-4 text-sm text-ink-muted" data-testid="map-node-panel-empty">
              {state.focus != null
                ? `Opportunity #${state.focus} isn't on the map — it may have been removed or isn't a founder lead or active deal.`
                : "Select a node to see its signals, relationships, and a link to the full opportunity."}
            </div>
          )}
          {!data!.has_thesis && (
            <p className="rounded-lg border border-caution/30 bg-caution-wash p-3 text-xs text-caution">
              No active thesis — thesis fit can&apos;t be plotted. <Link href="/vc/thesis" className="underline">Set one up</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const item = (style: React.CSSProperties, label: string) => (
    <span className="flex items-center gap-1.5 text-xs text-ink-soft">
      <span aria-hidden className="h-3 w-3 rounded-full" style={style} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-3" aria-label="Legend">
      {item({ border: `3px solid ${STAGE_COLORS.sourcing}` }, "Founder lead")}
      {item({ background: STAGE_COLORS.screening }, "Screening")}
      {item({ background: STAGE_COLORS.diligence }, "Diligence")}
      {item({ background: STAGE_COLORS.decision }, "Decision")}
      <span className="text-xs text-ink-muted">Size = founder score</span>
    </div>
  );
}
