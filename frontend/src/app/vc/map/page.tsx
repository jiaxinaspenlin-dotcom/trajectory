"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import {
  AxisChoice, availableMetrics, axesLayout, clusterColors, filterNodes, groupNodes, hasWebGL, MapKind, MapSource,
  MapState, mapStateToQuery, matchesSearch, MetricKey, METRICS, parseMapState, relationshipLayout,
} from "@/lib/opportunityMap";
import { MapData } from "@/lib/types";
import type { MapCanvasHandle } from "@/components/map/MapCanvas";
import { MapDrawer } from "@/components/map/MapDrawer";
import { MapList } from "@/components/map/MapList";
import { MapValuesPanel } from "@/components/map/MapValuesPanel";
import { ErrorState, Segmented, Spinner } from "@/components/ui";
import {
  CloseIcon, FilterIcon, ListIcon, MinusIcon, PlusIcon, ResetIcon, SearchIcon, SlidersIcon, TableIcon,
} from "@/components/icons";

// Three.js only runs in the browser; keep it out of the server render and other routes.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <Centered><Spinner label="Starting the map…" /></Centered>,
});

export default function MapPage() {
  return (
    <div className="dot-grid relative h-full w-full overflow-hidden">
      {/* useSearchParams needs a Suspense boundary for static rendering */}
      <Suspense fallback={<Centered><Spinner label="Loading map…" /></Centered>}>
        <OpportunityMap />
      </Suspense>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 grid place-items-center p-6">{children}</div>;
}

function OpportunityMap() {
  const { data, loading, error, reload } = useFetch<MapData>("/api/map");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = parseMapState(new URLSearchParams(params.toString()));
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [valuesOpen, setValuesOpen] = useState(false);
  const [q, setQ] = useState(state.q);
  const [resultsOpen, setResultsOpen] = useState(false);
  const canvasRef = useRef<MapCanvasHandle>(null);
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
  const colors = useMemo(() => clusterColors(all ?? []), [all]);
  const nodes = useMemo(() => (all ? filterNodes(all, state) : []), [all, state.source, state.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const links = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return (data?.links ?? []).filter((l) => ids.has(l.source) && ids.has(l.target));
  }, [data, nodes]);
  const relationships = useMemo(() => relationshipLayout(nodes), [nodes]);
  const axes = useMemo(() => axesLayout(nodes, { x: state.x, y: state.y, z: state.z }), [nodes, state.x, state.y, state.z]);
  const metrics = useMemo(() => availableMetrics(all ?? []), [all]);
  const matches = useMemo(() => (q.trim() ? nodes.filter((n) => matchesSearch(n, q)) : []), [nodes, q]);
  const highlight = useMemo(() => (q.trim() ? new Set(matches.map((n) => n.id)) : null), [q, matches]);

  if (loading && !data) return <Centered><Spinner label="Loading map…" /></Centered>;
  if (error) {
    return (
      <Centered>
        <div className="w-full max-w-md"><ErrorState message={`Couldn't load the map: ${error}`} onRetry={reload} /></div>
      </Centered>
    );
  }
  if (!all?.length) {
    return (
      <Centered>
        <div className="hud max-w-sm p-5 text-center">
          <p className="text-[15px] font-semibold text-ink">Nothing to map yet</p>
          <p className="mt-1 text-[13px] text-ink-muted">Founder leads and active deals appear here once you source founders or receive an application.</p>
          <Link href="/vc/founders?source=open" className="btn-primary mt-4">Source founders</Link>
        </div>
      </Centered>
    );
  }

  const byId = new Map(all.map((n) => [n.id, n]));
  const selected = state.focus != null ? byId.get(state.focus) ?? null : null;
  const visibleIds = new Set(nodes.map((n) => n.id));
  const leadCount = all.filter((n) => n.kind === "lead").length;
  const filtersActive = state.kind !== "all" || state.source !== "all";
  const isAxes = state.view === "axes";
  const showList = webgl === false || listOpen;

  function pick(id: number) {
    setResultsOpen(false);
    select(id);
  }

  return (
    <>
      {/* canvas (or list fallback) fills the workspace */}
      {webgl === false ? (
        <div className="absolute inset-0 overflow-y-auto pb-24 pt-28 sm:pt-16">
          <div className="mx-auto max-w-2xl px-3">
            <p className="mb-2 rounded-md border border-caution/30 bg-caution-wash px-3 py-2 text-xs text-caution" role="status">
              WebGL isn&apos;t available in this browser, so the map is shown as a grouped list.
            </p>
            <div className="hud"><MapList nodes={nodes} colors={colors} selectedId={state.focus} query={q} onSelect={select} /></div>
          </div>
        </div>
      ) : webgl === null ? (
        <Centered><Spinner label="Starting the map…" /></Centered>
      ) : (
        <MapCanvas
          apiRef={canvasRef}
          nodes={nodes}
          links={links}
          colors={colors}
          mode={state.view}
          relationships={relationships}
          axes={axes}
          selectedId={state.focus}
          highlight={highlight}
          onSelect={select}
          onUnavailable={onUnavailable}
        />
      )}

      {!nodes.length && webgl !== false && (
        <Centered>
          <div className="hud pointer-events-auto p-4 text-center text-[13px] text-ink-muted">
            No opportunities match these filters.
            <button className="btn-secondary btn-sm ml-2" onClick={() => update({ kind: "all", source: "all" })}>Clear filters</button>
          </div>
        </Centered>
      )}

      {/* top row: sourcing · search · filters — one flex row so nothing collides, narrowing beside the drawer */}
      <div className={`pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-start gap-2 ${selected ? "sm:right-[384px]" : ""}`}>
        <div className="pointer-events-auto hidden shrink-0 items-center gap-2 lg:flex">
          <div className="hud flex h-9 items-center gap-2 px-3 text-[13px]">
            <span className="text-ink-muted">Founder leads</span>
            <span className="num font-semibold text-ink">{leadCount}</span>
          </div>
          <Link href="/vc/founders?source=open" className="btn-primary h-9 shadow-raised">+ Source</Link>
        </div>

        <div className="pointer-events-auto relative mx-auto min-w-0 flex-1 lg:max-w-md">
          <div className="hud flex h-9 items-center focus-within:border-brand" role="search">
            <SearchIcon className="ml-2.5 shrink-0 text-ink-muted" />
            <input
              type="search"
              value={q}
              aria-label="Search the map"
              placeholder="Search founders, companies, topics"
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-ink-faint"
              onChange={(e) => { setQ(e.target.value); setResultsOpen(true); update({ q: e.target.value }); }}
              onFocus={() => setResultsOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) pick(matches[0].id);
                if (e.key === "Escape") { setQ(""); update({ q: "" }); e.currentTarget.blur(); }
                if (e.key === "ArrowDown") (document.querySelector("[data-search-result]") as HTMLElement | null)?.focus();
              }}
            />
            {q.trim() && (
              <>
                <span className="num whitespace-nowrap text-[11px] text-ink-muted">{matches.length} {matches.length === 1 ? "match" : "matches"}</span>
                <button type="button" className="icon-btn mx-0.5 h-7 w-7" aria-label="Clear search" onClick={() => { setQ(""); update({ q: "" }); }}>
                  <CloseIcon size={14} />
                </button>
              </>
            )}
          </div>
          {q.trim() && resultsOpen && (
            <ul className="hud absolute inset-x-0 top-full mt-1 max-h-72 overflow-y-auto py-1" aria-label="Search results">
              {matches.length ? matches.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    data-search-result
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-surface-sunken focus:bg-surface-sunken focus:outline-none"
                    onClick={() => pick(n.id)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") ((e.currentTarget.parentElement?.nextElementSibling?.firstElementChild) as HTMLElement | null)?.focus();
                      if (e.key === "ArrowUp") ((e.currentTarget.parentElement?.previousElementSibling?.firstElementChild) as HTMLElement | null)?.focus();
                    }}
                  >
                    <span className="truncate font-medium text-ink">{n.name}</span>
                    <span className="shrink-0 text-[11px] text-ink-muted">{n.group.label}</span>
                  </button>
                </li>
              )) : <li className="px-3 py-1.5 text-xs text-ink-muted">No matches in the current filters</li>}
            </ul>
          )}
        </div>

        <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-2">
          <div className="flex gap-2">
            <Link href="/vc/founders?source=open" className="hud grid h-9 w-9 place-items-center text-brand lg:hidden" aria-label="Source founders"><PlusIcon /></Link>
            <button
              type="button"
              className={`hud flex h-9 items-center gap-1.5 px-2.5 text-[13px] font-medium ${filtersActive ? "text-brand" : "text-ink-soft"}`}
              aria-expanded={filtersOpen}
              aria-controls="map-filters"
              aria-label="Filters"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <FilterIcon /> <span className="hidden sm:inline">Filters</span>{filtersActive && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="active" />}
            </button>
          </div>
          {filtersOpen && (
            <div id="map-filters" className="hud w-64 space-y-3 p-3">
              <div>
                <p className="label mb-1">Records</p>
                <Segmented<MapKind> size="sm" label="Filter by record type" value={state.kind} onChange={(v) => update({ kind: v })}
                  options={[{ value: "all", label: "All" }, { value: "lead", label: "Leads" }, { value: "deal", label: "Deals" }]} />
              </div>
              <div>
                <p className="label mb-1">Source</p>
                <Segmented<MapSource> size="sm" label="Filter by source" value={state.source} onChange={(v) => update({ source: v })}
                  options={[{ value: "all", label: "All" }, { value: "inbound", label: "Inbound" }, { value: "outbound", label: "Outbound" }]} />
              </div>
              <p className="num text-[11px] text-ink-muted">{nodes.length} of {all.length} shown</p>
            </div>
          )}
          {!selected && !filtersOpen && <Legend nodes={nodes} colors={colors} />}
        </div>
      </div>

      {/* list view over the canvas (keyboard-accessible selection) */}
      {listOpen && webgl !== false && (
        <div className="hud absolute bottom-[4.5rem] left-3 top-14 z-20 w-[min(20rem,calc(100%-1.5rem))] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[13px] font-semibold text-ink">All records</span>
            <button type="button" className="icon-btn h-7 w-7" onClick={() => setListOpen(false)} aria-label="Close list"><CloseIcon size={14} /></button>
          </div>
          <MapList nodes={nodes} colors={colors} selectedId={state.focus} query={q} onSelect={select} />
        </div>
      )}

      {/* view controls: a column under the search on phones, bottom-left on larger screens */}
      <div className="absolute left-3 top-14 z-20 flex flex-col items-start gap-2 sm:bottom-3 sm:top-auto sm:flex-row sm:items-end">
        {webgl !== false && (
          <div className="hud flex flex-col p-0.5" role="group" aria-label="Camera">
            <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => canvasRef.current?.zoom(0.7)}><PlusIcon /></button>
            <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => canvasRef.current?.zoom(1.4)}><MinusIcon /></button>
            <button type="button" className="icon-btn" aria-label="Reset view" onClick={() => canvasRef.current?.reset()}><ResetIcon /></button>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {isAxes && (
            <button type="button" className={`hud flex h-9 items-center gap-1.5 px-2.5 text-[13px] font-medium ${valuesOpen ? "text-brand" : "text-ink-soft"}`}
              aria-expanded={valuesOpen} aria-label={`Values: ${axes.values.size} of ${nodes.length} plotted`} onClick={() => setValuesOpen((v) => !v)}>
              <TableIcon /> <span className="hidden sm:inline">Values</span> <span className="num text-ink-muted">{axes.values.size}/{nodes.length}</span>
            </button>
          )}
          {webgl !== false && (
            <button type="button" className={`hud flex h-9 items-center gap-1.5 px-2.5 text-[13px] font-medium ${listOpen ? "text-brand" : "text-ink-soft"}`}
              aria-pressed={listOpen} aria-label="List" onClick={() => setListOpen((v) => !v)}>
              <ListIcon /> <span className="hidden sm:inline">List</span>
            </button>
          )}
        </div>
      </div>
      {isAxes && valuesOpen && (
        <div className="absolute bottom-[3.75rem] left-1/2 z-30 -translate-x-1/2 sm:left-16 sm:translate-x-0">
          <MapValuesPanel nodes={nodes} axes={axes} selectedId={state.focus} onSelect={select} onClose={() => setValuesOpen(false)} />
        </div>
      )}

      {/* bottom-center: axis selectors above the mode switcher */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
        {isAxes && !valuesOpen && (
          <AxisPanel x={state.x} y={state.y} z={state.z} options={metrics} onChange={(patch) => update(patch)} />
        )}
        <div className="hud pointer-events-auto flex p-0.5" role="group" aria-label="Map mode">
          {([["graph", "Relationships"], ["axes", "Custom Axes"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={state.view === v}
              onClick={() => { update({ view: v }); if (v === "graph") setValuesOpen(false); }}
              className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-3.5 text-[13px] font-semibold transition-colors ${state.view === v ? "bg-ink text-white" : "text-ink-soft hover:bg-neutral-wash"}`}
            >
              {label}{v === "axes" && <SlidersIcon size={14} />}
            </button>
          ))}
        </div>
      </div>

      <p className={`pointer-events-none absolute bottom-4 right-4 z-10 hidden text-[11px] uppercase tracking-[0.08em] text-ink-muted xl:block ${selected ? "xl:hidden" : ""}`}>
        Drag orbit · Right-drag pan · Scroll zoom · Click focus
      </p>

      {selected && (
        <MapDrawer
          node={selected}
          links={data!.links}
          nodesById={byId}
          colors={colors}
          mode={state.view}
          axes={axes}
          hiddenByFilters={!visibleIds.has(selected.id)}
          onSelect={select}
          onClose={() => select(null)}
        />
      )}
      {state.focus != null && !selected && (
        <div className="hud absolute bottom-16 right-3 z-30 max-w-xs px-3 py-2 text-xs text-ink-muted sm:top-14 sm:bottom-auto" data-testid="map-node-panel-empty">
          Opportunity #{state.focus} isn&apos;t on the map — it may have been removed, or it isn&apos;t a founder lead or active deal.
          <button className="btn-ghost btn-sm ml-1" onClick={() => select(null)}>Dismiss</button>
        </div>
      )}
      {!data!.has_thesis && (
        <p className="hud absolute bottom-16 right-3 z-10 max-w-xs px-3 py-2 text-xs text-caution">
          No active thesis — thesis fit can&apos;t be plotted. <Link href="/vc/fund" className="underline">Set up the fund thesis</Link>.
        </p>
      )}
    </>
  );
}

function Legend({ nodes, colors }: { nodes: MapNode[]; colors: Map<string, string> }) {
  const groups = groupNodes(nodes);
  return (
    <div className="pointer-events-none hidden flex-col items-end gap-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-soft sm:flex" aria-label="Legend">
      {groups.slice(0, 10).map((g) => (
        <span key={g.key} className="flex items-center gap-1.5">
          {g.label}
          <i className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: colors.get(g.key) }} />
        </span>
      ))}
      <span className="mt-1 flex items-center gap-3 normal-case tracking-normal text-ink-muted">
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full border-[2.5px] border-ink-muted" /> Lead</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-ink-muted" /> Active deal</span>
      </span>
      {nodes.some((n) => n.new_evidence_count) && (
        <span className="flex items-center gap-1 normal-case tracking-normal text-ink-muted" data-testid="legend-new-evidence">
          <i className="inline-block h-3 w-3 rounded-full border-2 border-signal bg-signal-wash" /> New evidence
        </span>
      )}
    </div>
  );
}

function AxisPanel({ x, y, z, options, onChange }: {
  x: MetricKey; y: MetricKey; z: AxisChoice; options: MetricKey[];
  onChange: (patch: Partial<Pick<MapState, "x" | "y" | "z">>) => void;
}) {
  const choices: { axis: "x" | "y" | "z"; value: AxisChoice }[] = [{ axis: "x", value: x }, { axis: "y", value: y }, { axis: "z", value: z }];
  return (
    <div className="hud pointer-events-auto grid w-[min(30rem,calc(100vw-1.5rem))] grid-cols-3 gap-2 p-2.5" data-testid="axis-panel" aria-label="Custom axes">
      {choices.map(({ axis, value }) => (
        <label key={axis} className="min-w-0">
          <span className="mb-0.5 block text-[11px] font-semibold text-ink">{axis.toUpperCase()} axis</span>
          <select
            className="select h-8 px-1.5 text-[11px] sm:px-2.5 sm:text-xs"
            value={value}
            aria-label={`${axis.toUpperCase()} axis metric`}
            onChange={(e) => {
              const v = e.target.value as AxisChoice;
              const next = { x, y, z, [axis]: v } as { x: MetricKey; y: MetricKey; z: AxisChoice };
              // a metric can only sit on one axis: swap with the axis that had it
              const clash = choices.find((c) => c.axis !== axis && c.value === v);
              if (clash) (next as Record<string, AxisChoice>)[clash.axis] = clash.axis === "z" ? "none" : (value as MetricKey);
              if (next.x === "none" as never || next.y === "none" as never) return;
              onChange(next);
            }}
          >
            {axis === "z" && <option value="none">None (plane)</option>}
            {options.map((k) => <option key={k} value={k}>{METRICS[k].short}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

type MapNode = MapData["items"][number];
