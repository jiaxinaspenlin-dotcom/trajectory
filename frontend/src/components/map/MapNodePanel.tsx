"use client";

import { useState } from "react";
import Link from "next/link";
import { humanStatus, trajectoryTone } from "@/lib/format";
import { groupFieldLabel, linksFor, nodeKindLabel } from "@/lib/opportunityMap";
import { MapLink, MapNode } from "@/lib/types";
import { SourceBadge, StageBadge } from "../DealBadges";
import { Badge } from "../ui";

export function MapNodePanel({
  node,
  links,
  nodesById,
  hiddenByFilters,
  plotted,
  view,
  onSelect,
  onClose,
}: {
  node: MapNode;
  links: MapLink[];
  nodesById: Map<number, MapNode>;
  hiddenByFilters: boolean;
  plotted: boolean;
  view: "graph" | "axes";
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const related = linksFor(node.id, links).filter((r) => nodesById.has(r.other));

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
    <aside className="card p-4" data-testid="map-node-panel" aria-label={`Selected: ${node.name}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="label text-brand">{nodeKindLabel(node)}</p>
          <h2 className="mt-0.5 truncate text-base font-semibold text-ink">{node.name}</h2>
          {node.company?.one_liner && <p className="mt-0.5 text-xs text-ink-muted">{node.company.one_liner}</p>}
          {node.founder && node.company && <p className="text-xs text-ink-muted">Founder: {node.founder.full_name}</p>}
        </div>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onClose} aria-label="Clear selection">✕</button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <SourceBadge entryType={node.entry_type} />
        <StageBadge stage={node.stage} />
        {node.status === "dismissed" && <Badge tone="bg-negative-wash text-negative">Dismissed</Badge>}
        {node.is_demo && <Badge>Demo data</Badge>}
      </div>

      {hiddenByFilters && <p className="mt-2 rounded-md bg-caution-wash px-2 py-1 text-xs text-caution">Hidden by the current filters.</p>}
      {view === "axes" && !plotted && !hiddenByFilters && (
        <p className="mt-2 rounded-md bg-neutral-wash px-2 py-1 text-xs text-neutral">Not on the chart — see the reasons below.</p>
      )}

      <dl className="mt-3 space-y-2 text-sm">
        <Row label="Group">
          {node.group.label}
          <span className="block text-xs text-ink-muted">{groupFieldLabel(node.group.field)}</span>
        </Row>
        <Row label="Founder score">{node.founder_score != null ? Math.round(node.founder_score) : <Muted>Not scored</Muted>}</Row>
        <Row label="Thesis fit">
          {node.thesis_fit.value != null ? `${Math.round(node.thesis_fit.value)} / 100` : <Muted>{node.thesis_fit.reason}</Muted>}
        </Row>
        <Row label="Momentum">
          {node.momentum.value != null ? (
            <span className="flex flex-wrap items-center gap-1.5">
              {node.momentum.value >= 0 ? "+" : ""}{Math.round(node.momentum.value * 10) / 10} pts / 30d
              {node.momentum.trajectory && <Badge tone={trajectoryTone(node.momentum.trajectory)}>{humanStatus(node.momentum.trajectory)}</Badge>}
            </span>
          ) : <Muted>{node.momentum.reason}</Muted>}
        </Row>
        <Row label="Evidence">{node.evidence_count ? `${node.evidence_count} items` : <Muted>None collected yet</Muted>}</Row>
        {node.top_project && (
          <Row label="Top project">
            {node.top_project.url
              ? <a href={node.top_project.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">{node.top_project.name} ↗</a>
              : node.top_project.name}
            {node.top_project.stars != null && <span className="ml-1 text-xs text-ink-muted">★ {node.top_project.stars}</span>}
          </Row>
        )}
        {node.topics.length > 0 && <Row label="Repo topics">{node.topics.slice(0, 8).join(", ")}</Row>}
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
          <p className="mt-1 text-xs text-ink-muted">No named relationships to other opportunities yet (shown in its {node.group.label} group).</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/vc/opportunities/${node.id}`} className="btn-primary text-xs">Open opportunity →</Link>
        {node.in_pipeline && <Link href={`/vc/pipeline?stage=${node.stage}`} className="btn-secondary text-xs">Pipeline</Link>}
        {node.in_founders && <Link href="/vc/founders" className="btn-secondary text-xs">Founders</Link>}
        <button type="button" className="btn-ghost text-xs" onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</button>
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-ink-soft">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-ink-muted">{children}</span>;
}
