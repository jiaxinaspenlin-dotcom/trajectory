// Shared vocabulary for the Founders and Pipeline views. Both read the same
// backend Opportunity records by ID; these helpers only decide how to show them.

import { humanStatus } from "./format";
import { PipelineStatus } from "./myWorkspace";
import { FounderLead, PipelineDeal } from "./types";

// Stages an opportunity must reach to count as an active deal (mirrors the
// backend's PIPELINE_STAGES). Sourcing-stage leads live in Founders.
export const PIPELINE_STAGES = ["screening", "diligence", "decision"] as const;
export type SourceFilter = "all" | "inbound" | "outbound";

// Stage badges step up in intensity as a deal advances.
export function stageTone(stage: string): string {
  switch (stage) {
    case "screening":
      return "bg-brand-wash text-brand";
    case "diligence":
      return "bg-brand text-white";
    case "decision":
      return "bg-ink text-white";
    default:
      return "bg-neutral-wash text-neutral";
  }
}

export function sourceLabel(entryType: string): string {
  return entryType === "inbound" ? "Inbound" : entryType === "outbound" ? "Outbound" : humanStatus(entryType);
}

export function opportunityName(o: { id: number; company: { name: string } | null; founder: { full_name: string } | null }): string {
  return o.company?.name || o.founder?.full_name || `Opportunity #${o.id}`;
}

// ---- Founders -------------------------------------------------------------

export type FounderView = "active" | "pinned" | "in_pipeline" | "dismissed" | "all";

export const FOUNDER_VIEWS: { key: FounderView; label: string }[] = [
  { key: "active", label: "Active leads" },
  { key: "pinned", label: "Saved & monitoring" },
  { key: "in_pipeline", label: "In pipeline" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];

// A lead's prospect status: this browser's Save / Monitor / Dismiss overlay
// wins, else the shared status. The screening transition stores outbound leads
// as "applied" (to converge with inbound); they never applied, so say so.
export function leadStatus(lead: { entry_type: string; status: string }, overlay: PipelineStatus | null): string {
  if (overlay) return overlay;
  return lead.entry_type === "outbound" && lead.status === "applied" ? "in_pipeline" : lead.status;
}

export function inPipeline(lead: { stage: string }): boolean {
  return lead.stage !== "sourcing";
}

export function matchesFounderView(lead: FounderLead, overlay: PipelineStatus | null, view: FounderView): boolean {
  const status = leadStatus(lead, overlay);
  switch (view) {
    case "active":
      return status !== "dismissed";
    case "pinned":
      return status === "saved" || status === "monitoring";
    case "in_pipeline":
      return inPipeline(lead);
    case "dismissed":
      return status === "dismissed";
    case "all":
      return true;
  }
}

export function matchesQuery(lead: FounderLead, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [lead.founder?.full_name, lead.founder?.github_username, lead.company?.name, lead.top_project?.name]
    .some((v) => v?.toLowerCase().includes(q));
}

// Saved / monitoring leads first, then highest Founder Score; unscored last.
export function sortLeads(leads: FounderLead[], overlay: Record<number, PipelineStatus>): FounderLead[] {
  const pinned = (l: FounderLead) => {
    const s = leadStatus(l, overlay[l.id] ?? null);
    return s === "saved" || s === "monitoring" ? 0 : 1;
  };
  return [...leads].sort(
    (a, b) => pinned(a) - pinned(b) || (b.founder_score?.score ?? -1) - (a.founder_score?.score ?? -1)
  );
}

// ---- Pipeline -------------------------------------------------------------

export function filterDeals(deals: PipelineDeal[], stage: string, source: SourceFilter): PipelineDeal[] {
  return deals.filter(
    (d) => (stage === "all" || d.stage === stage) && (source === "all" || d.entry_type === source)
  );
}

export function parseStage(v: string | null): string {
  return v && (PIPELINE_STAGES as readonly string[]).includes(v) ? v : "all";
}

export function parseSource(v: string | null): SourceFilter {
  return v === "inbound" || v === "outbound" ? v : "all";
}
