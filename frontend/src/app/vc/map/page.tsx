"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import {
  AxisChoice, availableMetrics, axesLayout, clusterColors, filterNodes, groupLabel, groupNodes, hasWebGL, MapKind, MapSource,
  MapState, mapStateToQuery, matchesSearch, MetricKey, METRICS, parseMapState, relationshipLayout,
} from "@/lib/opportunityMap";
import { MapData } from "@/lib/types";
import type { MapCanvasHandle } from "@/components/map/MapCanvas";
import { MapDrawer } from "@/components/map/MapDrawer";
import { MapList } from "@/components/map/MapList";
import { MapValuesPanel } from "@/components/map/MapValuesPanel";
import { ErrorState, Segmented } from "@/components/ui";
import { useIndicator } from "@/lib/motion";
import {
  ChevronDownIcon, CloseIcon, FilterIcon, ListIcon, MinusIcon, PlusIcon, ResetIcon, SearchIcon, SlidersIcon, TableIcon,
} from "@/components/icons";

// Three.js only runs in the browser; keep it out of the server render and other routes.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <MapLoading label="Starting the Map…" />,
});

export default function MapPage() {
  return (
    <div className="dot-grid relative h-full w-full overflow-hidden">
      {/* useSearchParams needs a Suspense boundary for static rendering */}
      <Suspense fallback={<MapLoading label="Loading Map…" />}>
        <OpportunityMap />
      </Suspense>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 grid place-items-center p-6">{children}</div>;
}

// Loading: a few soft node shapes where the map will be, not a spinner.
const NODES = [[8, 40, 9], [60, 8, 12], [120, 34, 10], [44, 78, 11], [100, 86, 8], [150, 70, 9]];
function MapLoading({ label }: { label: string }) {
  return (
    <Centered>
      <div role="status" aria-label={label} className="flex flex-col items-center gap-4">
        <span className="sr-only">{label}</span>
        <div className="relative h-28 w-44" aria-hidden>
          {NODES.map(([x, y, r], i) => (
            <span key={i} className="skeleton absolute rounded-full" style={{ left: x, top: y, width: r * 2, height: r * 2, animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
        <p className="text-meta text-ink-muted" aria-hidden>{label}</p>
      </div>
    </Centered>
  );
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
  // legend: open by default where there's room; collapsible everywhere
  const [legendOpen, setLegendOpen] = useState<boolean | null>(null);
  const [roomy, setRoomy] = useState(true);
  useEffect(() => setRoomy(window.innerWidth >= 1280), []);
  const legendShown = legendOpen ?? roomy;
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

  if (loading && !data) return <MapLoading label="Loading Map…" />;
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
        <div className="hud animate-rise max-w-sm p-6 text-center">
          <p className="text-title text-ink">Nothing to Map Yet</p>
          <p className="mt-1 text-sm text-ink-muted">Founder leads and active deals appear here once you source founders or receive an application.</p>
          <Link href="/vc/founders?source=open" className="btn-primary mt-4">Source Founders</Link>
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
        <MapLoading label="Starting the Map…" />
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
          insetsKey={[state.focus ?? "", state.view, legendShown && !filtersOpen, filtersOpen, valuesOpen, listOpen, nodes.length].join("|")}
        />
      )}

      {!nodes.length && webgl !== false && (
        <Centered>
          <div className="hud animate-rise pointer-events-auto p-4 text-center text-sm text-ink-muted">
            No opportunities match these filters.
            <button className="btn-secondary btn-sm ml-2" onClick={() => update({ kind: "all", source: "all" })}>Clear Filters</button>
          </div>
        </Centered>
      )}

      {/* Every control sits 16px from the canvas edge. Elements marked data-map-inset
          are measured by the canvas so nodes are framed in the space they leave. */}
      {/* top row: sourcing · search · filters — one flex row, narrowing beside the drawer */}
      <div data-map-inset="top" className={`pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-start gap-2 sm:left-4 sm:right-4 sm:top-4 sm:gap-3 ${selected ? "sm:right-[432px]" : ""}`}>
        <div className="pointer-events-auto hidden shrink-0 items-center gap-2 lg:flex">
          <div className="hud flex h-10 items-center gap-2 px-4 text-sm">
            <span className="text-ink-muted" title="Leads in Sourcing (Not Yet in Pipeline)">Leads</span>
            <span className="num font-semibold text-ink">{leadCount}</span>
          </div>
          {/* primary until a record is open — then the drawer's Open opportunity is the main action */}
          <Link href="/vc/founders?source=open" className={selected ? "btn-secondary shadow-raised" : "btn-primary shadow-raised"}>Source Founders</Link>
        </div>

        <div className="pointer-events-auto relative mx-auto min-w-0 flex-1 lg:max-w-lg">
          <div className="hud flex h-10 items-center focus-within:border-brand" role="search">
            <SearchIcon size={18} className="ml-3 shrink-0 text-ink-muted" />
            <input
              type="search"
              value={q}
              aria-label="Search the Map"
              placeholder="Search Founders, Companies, Topics"
              className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[15px] text-ink outline-none placeholder:text-ink-faint"
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
                <span className="num whitespace-nowrap text-[13px] text-ink-muted">{matches.length} {matches.length === 1 ? "Match" : "Matches"}</span>
                <button type="button" className="icon-btn mx-0.5 h-9 w-9" aria-label="Clear Search" onClick={() => { setQ(""); update({ q: "" }); }}>
                  <CloseIcon size={16} />
                </button>
              </>
            )}
          </div>
          {q.trim() && resultsOpen && (
            <ul className="hud menu-enter absolute inset-x-0 top-full mt-2 max-h-80 overflow-y-auto py-1" aria-label="Search Results">
              {matches.length ? matches.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    data-search-result
                    className="press flex min-h-10 w-full items-center justify-between gap-3 px-4 py-2 text-left text-[15px] transition-colors duration-fast hover:bg-surface-sunken focus:bg-surface-sunken focus:outline-none"
                    onClick={() => pick(n.id)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") ((e.currentTarget.parentElement?.nextElementSibling?.firstElementChild) as HTMLElement | null)?.focus();
                      if (e.key === "ArrowUp") ((e.currentTarget.parentElement?.previousElementSibling?.firstElementChild) as HTMLElement | null)?.focus();
                    }}
                  >
                    <span className="truncate font-medium text-ink" data-content>{n.name}</span>
                    <span className="shrink-0 text-[13px] text-ink-muted">{groupLabel(n.group)}</span>
                  </button>
                </li>
              )) : <li className="px-4 py-2 text-sm text-ink-muted">No Matches in the Current Filters</li>}
            </ul>
          )}
        </div>

        <div className="pointer-events-auto relative flex shrink-0 gap-2">
          <Link href="/vc/founders?source=open" aria-label="Source Founders"
            className={`grid h-10 w-10 place-items-center lg:hidden ${selected ? "hud text-brand" : "btn-primary px-0 shadow-raised"}`}><PlusIcon size={18} /></Link>
          <button
            type="button"
            className={`hud press flex h-10 items-center gap-2 px-3 text-sm font-medium transition-colors duration-fast hover:bg-surface-sunken sm:px-3.5 ${filtersActive ? "text-brand" : "text-ink-soft"}`}
            aria-expanded={filtersOpen}
            aria-controls="map-filters"
            aria-label="Filters"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <FilterIcon size={18} /> <span className="hidden sm:inline">Filters</span>{filtersActive && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="Active" />}
          </button>
          {filtersOpen && (
            <div id="map-filters" className="hud menu-enter absolute right-0 top-full z-30 mt-2 w-72 origin-top-right space-y-4 p-4">
              <div>
                <p className="label mb-1.5">Records</p>
                <Segmented<MapKind> size="sm" label="Filter by Record Type" value={state.kind} onChange={(v) => update({ kind: v })}
                  options={[{ value: "all", label: "All" }, { value: "lead", label: "Leads" }, { value: "deal", label: "Deals" }]} />
                <p className="mt-1.5 text-xs text-ink-muted">Leads are in Sourcing (Founders); deals are in Pipeline.</p>
              </div>
              <div>
                <p className="label mb-1.5">Source</p>
                <Segmented<MapSource> size="sm" label="Filter by Source" value={state.source} onChange={(v) => update({ source: v })}
                  options={[{ value: "all", label: "All" }, { value: "inbound", label: "Inbound" }, { value: "outbound", label: "Outbound" }]} />
                <p className="mt-1.5 text-xs text-ink-muted">Inbound applied through the founder portal; outbound were sourced by you.</p>
              </div>
              <p className="num text-[13px] text-ink-muted">{nodes.length} of {all.length} Shown</p>
            </div>
          )}
        </div>
      </div>

      {/* legend: right edge under the top row; collapsible, and out of the way of the drawer */}
      {!selected && !filtersOpen && (
        <Legend nodes={nodes} colors={colors} open={legendShown} onToggle={() => setLegendOpen(!legendShown)} />
      )}

      {/* list view over the canvas (keyboard-accessible selection) */}
      {listOpen && webgl !== false && (
        <div data-map-inset="auto" className="hud menu-enter absolute bottom-24 left-3 top-[4.25rem] z-20 w-[min(22rem,calc(100%-1.5rem))] origin-top-left overflow-y-auto sm:left-4 sm:top-[4.5rem]">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <span className="text-[15px] font-semibold text-ink">All Records</span>
            <button type="button" className="icon-btn h-9 w-9" onClick={() => setListOpen(false)} aria-label="Close List"><CloseIcon size={16} /></button>
          </div>
          <MapList nodes={nodes} colors={colors} selectedId={state.focus} query={q} onSelect={select} />
        </div>
      )}

      {/* view controls: a column under the search on phones, bottom-left on larger screens */}
      <div className="absolute left-3 top-[4.25rem] z-20 flex flex-col items-start gap-2 sm:bottom-4 sm:left-4 sm:top-auto sm:flex-row sm:items-end">
        {webgl !== false && (
          <div className="hud flex flex-col p-0.5" role="group" aria-label="Camera">
            <button type="button" className="icon-btn" aria-label="Zoom In" onClick={() => canvasRef.current?.zoom(0.7)}><PlusIcon size={18} /></button>
            <button type="button" className="icon-btn" aria-label="Zoom Out" onClick={() => canvasRef.current?.zoom(1.4)}><MinusIcon size={18} /></button>
            <button type="button" className="icon-btn" aria-label="Reset View" onClick={() => canvasRef.current?.reset()}><ResetIcon size={18} /></button>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {isAxes && (
            <button type="button" className={`hud press flex h-10 items-center gap-2 px-3 text-sm font-medium transition-colors duration-fast hover:bg-surface-sunken ${valuesOpen ? "text-brand" : "text-ink-soft"}`}
              aria-expanded={valuesOpen} aria-label={`Values: ${axes.values.size} of ${nodes.length} Plotted`} onClick={() => setValuesOpen((v) => !v)}>
              <TableIcon size={18} /> <span className="hidden sm:inline">Values</span> <span className="num text-ink-muted">{axes.values.size}/{nodes.length}</span>
            </button>
          )}
          {webgl !== false && (
            <button type="button" className={`hud press flex h-10 items-center gap-2 px-3 text-sm font-medium transition-colors duration-fast hover:bg-surface-sunken ${listOpen ? "text-brand" : "text-ink-soft"}`}
              aria-pressed={listOpen} aria-label="List" onClick={() => setListOpen((v) => !v)}>
              <ListIcon size={18} /> <span className="hidden sm:inline">List</span>
            </button>
          )}
        </div>
      </div>
      {isAxes && valuesOpen && (
        <div data-map-inset="bottom" className="menu-enter absolute bottom-[4.5rem] left-1/2 z-30 -translate-x-1/2 sm:bottom-4 sm:left-[4.5rem] sm:translate-x-0">
          <MapValuesPanel nodes={nodes} axes={axes} selectedId={state.focus} onSelect={select} onClose={() => setValuesOpen(false)} />
        </div>
      )}

      {/* bottom-center: axis selectors above the mode switcher */}
      {/* centered in the space the drawer leaves, so the axis pickers never slide under it */}
      <div data-map-inset="bottom" className={`pointer-events-none absolute bottom-3 z-20 flex flex-col items-center gap-2 sm:bottom-4 ${
        selected ? "left-1/2 -translate-x-1/2 sm:left-3 sm:right-[27rem] sm:translate-x-0 xl:left-[13.5rem]" : "left-1/2 -translate-x-1/2"}`}>
        {isAxes && !valuesOpen && (
          // with a record open, the pickers sit between the left controls and the drawer;
          // below 1280px there's no room, so they wait until the drawer closes
          <div className={selected ? "hidden w-full max-w-[36rem] xl:block" : ""}>
            <AxisPanel x={state.x} y={state.y} z={state.z} options={metrics} onChange={(patch) => update(patch)} fill={!!selected} />
          </div>
        )}
        <ModeSwitch value={state.view} onChange={(v) => { update({ view: v }); if (v === "graph") setValuesOpen(false); }} />
      </div>

      <p className={`pointer-events-none absolute bottom-6 right-4 z-10 hidden text-xs text-ink-muted 2xl:block ${selected ? "2xl:hidden" : ""}`}>
        Drag to Orbit · Right-Drag to Pan · Scroll to Zoom · Click to Focus
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
        <div className="hud absolute bottom-20 right-4 z-30 max-w-xs px-4 py-3 text-sm text-ink-muted sm:top-[4.5rem] sm:bottom-auto" data-testid="map-node-panel-empty">
          Opportunity #{state.focus} isn&apos;t on the map — it may have been removed, or it isn&apos;t a founder lead or active deal.
          <button className="btn-ghost btn-sm ml-1" onClick={() => select(null)}>Dismiss</button>
        </div>
      )}
      {!data!.has_thesis && (
        <p className="hud absolute bottom-20 right-4 z-10 max-w-xs px-4 py-3 text-sm text-caution">
          No active thesis — thesis fit can&apos;t be plotted. <Link href="/vc/fund" className="underline">Set Up Your Fund Thesis</Link>.
        </p>
      )}
    </>
  );
}

function Legend({ nodes, colors, open, onToggle }: {
  nodes: MapNode[]; colors: Map<string, string>; open: boolean; onToggle: () => void;
}) {
  const groups = groupNodes(nodes);
  return (
    <div className="pointer-events-none absolute right-4 top-[4.5rem] z-20 hidden flex-col items-end gap-2 sm:flex">
      <button
        type="button"
        className="hud press pointer-events-auto flex h-9 items-center gap-2 px-3 text-sm font-medium text-ink-soft transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
        aria-expanded={open}
        aria-controls="map-legend"
        onClick={onToggle}
      >
        Legend <ChevronDownIcon size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id="map-legend" data-map-inset="right" aria-label="Legend" className="hud menu-enter pointer-events-auto max-h-[calc(100vh-14rem)] w-60 origin-top-right overflow-y-auto px-4 py-3 text-[13px] text-ink-soft">
          <p className="label mb-1.5">Groups</p>
          <ul className="space-y-1">
            {groups.slice(0, 12).map((g) => (
              <li key={g.key} className="flex items-center gap-2">
                <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors.get(g.key) }} />
                <span className="truncate">{g.label}</span>
                <span className="num ml-auto text-ink-muted">{g.ids.length}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-line pt-2.5 text-ink-muted">
            <p className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded-full border-[2.5px] border-ink-muted" /> Lead · In Sourcing</p>
            <p className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded-full bg-ink-muted" /> Deal · In Pipeline</p>
            <p className="pt-1 text-xs">Colors group by company sector, or by GitHub language when there&apos;s no company yet.</p>
            {nodes.some((n) => n.new_evidence_count) && (
              <p className="flex items-center gap-2" data-testid="legend-new-evidence">
                <i className="inline-block h-3.5 w-3.5 rounded-full border-2 border-signal bg-signal-wash" /> New Evidence
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Relationships / Custom Axes. The selected mode is a dark pill that slides.
function ModeSwitch({ value, onChange }: { value: "graph" | "axes"; onChange: (v: "graph" | "axes") => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useIndicator(ref, "[aria-pressed='true']", [value]);
  return (
    <div ref={ref} className="hud pointer-events-auto relative flex p-1" role="group" aria-label="Map Mode">
      {box && <span aria-hidden className="absolute left-0 top-0 rounded-md bg-ink transition-transform duration-base ease-out"
        style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }} />}
      {([["graph", "Relationships"], ["axes", "Custom Axes"]] as const).map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`press relative flex h-10 items-center gap-2 whitespace-nowrap rounded-md px-4 text-[15px] font-semibold transition-colors duration-base sm:px-5 ${
            value === v ? `text-white ${box ? "" : "bg-ink"}` : "text-ink-soft hover:bg-neutral-wash"}`}
        >
          {label}{v === "axes" && <SlidersIcon size={16} />}
        </button>
      ))}
    </div>
  );
}

function AxisPanel({ x, y, z, options, onChange, fill = false }: {
  x: MetricKey; y: MetricKey; z: AxisChoice; options: MetricKey[]; fill?: boolean;
  onChange: (patch: Partial<Pick<MapState, "x" | "y" | "z">>) => void;
}) {
  const choices: { axis: "x" | "y" | "z"; value: AxisChoice }[] = [{ axis: "x", value: x }, { axis: "y", value: y }, { axis: "z", value: z }];
  return (
    <div className={`hud pointer-events-auto grid grid-cols-3 gap-2 p-3 sm:gap-3 ${fill ? "w-full" : "w-[min(36rem,calc(100vw-1.5rem))]"}`} data-testid="axis-panel" aria-label="Custom Axes">
      {choices.map(({ axis, value }) => (
        <label key={axis} className="min-w-0">
          <span className="mb-1 block text-[13px] font-semibold text-ink">{axis.toUpperCase()} Axis</span>
          <select
            className="select px-2 text-[13px] sm:px-3 sm:text-sm"
            value={value}
            aria-label={`${axis.toUpperCase()} Axis Metric`}
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
            {axis === "z" && <option value="none">None (Plane)</option>}
            {options.map((k) => <option key={k} value={k}>{METRICS[k].short}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

type MapNode = MapData["items"][number];
