"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { humanStatus, trajectoryTone } from "@/lib/format";
import {
  AxesLayout, formatMetric, groupFieldLabel, linksFor, METRICS, nodeColor, nodeKindLabel,
} from "@/lib/opportunityMap";
import { MapLink, MapNode } from "@/lib/types";
import { SourceBadge, StageBadge } from "../DealBadges";
import { ArrowRightIcon, CloseIcon, LinkIcon } from "../icons";
import { Badge } from "../ui";

// Selected-opportunity drawer over the map canvas: a right panel on desktop,
// a bottom sheet on phones.
export function MapDrawer({
  node, links, nodesById, colors, mode, axes, hiddenByFilters, onSelect, onClose,
}: {
  node: MapNode;
  links: MapLink[];
  nodesById: Map<number, MapNode>;
  colors: Map<string, string>;
  mode: "graph" | "axes";
  axes: AxesLayout;
  hiddenByFilters: boolean;
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const related = linksFor(node.id, links).filter((r) => nodesById.has(r.other));
  const excluded = axes.excluded.find((e) => e.node.id === node.id);
  const values = axes.values.get(node.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape" && !(t && /INPUT|TEXTAREA|SELECT/.test(t.tagName))) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyLink() {
    const url = `${window.location.origin}/vc/map?focus=${node.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <aside
      data-testid="map-node-panel"
      aria-label={`Selected opportunity: ${node.name}`}
      className="hud pointer-events-auto absolute inset-x-2 bottom-2 z-30 flex max-h-[58%] flex-col sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3 sm:max-h-none sm:w-[360px]"
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: nodeColor(node, colors) }} />
            {nodeKindLabel(node)}
          </p>
          <h2 className="mt-0.5 truncate text-[15px] font-semibold text-ink">{node.name}</h2>
          {node.company?.one_liner && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{node.company.one_liner}</p>}
          {node.founder && node.company && <p className="text-xs text-ink-muted">Founder · {node.founder.full_name}</p>}
        </div>
        <button ref={closeRef} type="button" className="icon-btn -mr-1.5 -mt-0.5" onClick={onClose} aria-label="Close and return to overview">
          <CloseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-wrap gap-1">
          <SourceBadge entryType={node.entry_type} />
          <StageBadge stage={node.stage} />
          {node.status === "dismissed" && <Badge tone="bg-negative-wash text-negative">Dismissed</Badge>}
          {node.is_demo && <Badge>Demo data</Badge>}
        </div>

        {hiddenByFilters && <p className="mt-3 rounded-md bg-caution-wash px-2.5 py-1.5 text-xs text-caution">Hidden by the current filters.</p>}

        {mode === "axes" && !hiddenByFilters && (
          excluded ? (
            <div className="mt-3 rounded-md border border-line bg-surface-sunken px-3 py-2" data-testid="drawer-not-plotted">
              <p className="text-xs font-semibold text-ink">Not plotted on these axes</p>
              <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                {excluded.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          ) : values ? (
            <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
              {axes.domains.map((d) => (
                <div key={d.axis} className="bg-white px-2.5 py-1.5">
                  <dt className="truncate text-[10.5px] text-ink-muted">{d.axis.toUpperCase()} · {METRICS[d.key].label}</dt>
                  <dd className="num text-[13px] font-semibold text-ink">{formatMetric(d.key, values[d.key]!)}</dd>
                </div>
              ))}
            </dl>
          ) : null
        )}

        <dl className="mt-3 divide-y divide-line text-[13px]">
          <Row label="Group">
            {node.group.label}
            <span className="block text-xs text-ink-muted">{groupFieldLabel(node.group.field)}</span>
          </Row>
          <Row label="Founder score">{node.founder_score != null ? <span className="num">{Math.round(node.founder_score)}</span> : <Muted>Not scored</Muted>}</Row>
          <Row label="Thesis fit">
            {node.thesis_fit.value != null ? <span className="num">{Math.round(node.thesis_fit.value)} / 100</span> : <Muted>{node.thesis_fit.reason}</Muted>}
          </Row>
          <Row label="Momentum">
            {node.momentum.value != null ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="num">{formatMetric("momentum", node.momentum.value)} / 30d</span>
                {node.momentum.trajectory && <Badge tone={trajectoryTone(node.momentum.trajectory)}>{humanStatus(node.momentum.trajectory)}</Badge>}
              </span>
            ) : <Muted>{node.momentum.reason}</Muted>}
          </Row>
          <Row label="Evidence">{node.evidence_count ? <span className="num">{node.evidence_count} items</span> : <Muted>None collected yet</Muted>}</Row>
          {node.top_project && (
            <Row label="Top project">
              {node.top_project.url
                ? <a href={node.top_project.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">{node.top_project.name} ↗</a>
                : node.top_project.name}
              {node.top_project.stars != null && <span className="num ml-1 text-xs text-ink-muted">★ {node.top_project.stars}</span>}
            </Row>
          )}
          {node.topics.length > 0 && <Row label="Repo topics"><span className="text-xs">{node.topics.slice(0, 8).join(", ")}</span></Row>}
          <Row label="Next action">{node.next_action ?? <Muted>None — decided or dismissed</Muted>}</Row>
        </dl>

        <div className="mt-3">
          <p className="label">Relationships</p>
          {related.length ? (
            <ul className="mt-1 space-y-1">
              {related.map(({ other, link }) => (
                <li key={`${link.kind}-${other}`} className="text-xs">
                  <button type="button" className="font-medium text-brand hover:underline" onClick={() => onSelect(other)}>
                    {nodesById.get(other)!.name}
                  </button>
                  <span className="text-ink-muted"> — {link.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">No named relationships yet. Clustered with its {node.group.label} group.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-2.5">
        <Link href={`/vc/opportunities/${node.id}`} className="btn-primary">Open opportunity <ArrowRightIcon size={14} /></Link>
        {node.in_pipeline && <Link href={`/vc/pipeline?stage=${node.stage}`} className="btn-secondary">Pipeline</Link>}
        {node.in_founders && <Link href="/vc/founders" className="btn-secondary">Founders</Link>}
        <button type="button" className="btn-ghost ml-auto" onClick={copyLink} aria-label="Copy link to this opportunity on the map">
          <LinkIcon size={14} /> {copied ? "Copied" : "Link"}
        </button>
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 py-1.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-ink-soft">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-ink-muted">{children}</span>;
}
