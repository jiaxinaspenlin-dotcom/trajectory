// The Pipeline as a board: one column per stage, deals in queue order, a few
// filters, and the rules the page states (what needs you, what has waited long).

import { PipelineDeal } from "@/lib/types";
import { opportunityName, sortDeals, SourceFilter } from "@/lib/pipeline";

export const BOARD_STAGES = ["sourcing", "screening", "diligence", "decision"] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];
export const DEAL_STAGES = ["screening", "diligence", "decision"] as const;

// A deal that has waited this many days or more is marked on its card.
export const LONG_WAIT_DAYS = 7;
export const waitedLong = (d: PipelineDeal) => d.next_action != null && d.age_days >= LONG_WAIT_DAYS;
export const waitingLabel = (days: number) => (days <= 0 ? "Waiting Since Today" : `Waiting ${days}d`);

// "Needs Me": a review is waiting on you, a recommendation or an application.
// Other next steps (analysis, open diligence, a memo) are work, not a review.
export const needsMe = (d: PipelineDeal) => d.next_action_key === "review_recommendation" || d.next_action_key === "review_application";

// What gets a deal into a column, from what the backend actually does. Nothing in
// the backend moves a deal into Decision yet: recording a decision deliberately
// doesn't change the stage.
export const EMPTY_COLUMN: Record<(typeof DEAL_STAGES)[number], string> = {
  screening: "Deals arrive here from founder applications, or when you move a lead to Screening in Founders.",
  diligence: "Deals arrive here when analysis runs on a deal in Screening.",
  decision: "No action moves a deal here yet. Recording a decision doesn't change a deal's stage.",
};

export interface BoardFilters { q: string; source: SourceFilter; mine: boolean; next: string | null }

export function matchesFilters(d: PipelineDeal, f: BoardFilters): boolean {
  if (f.source !== "all" && d.entry_type !== f.source) return false;
  if (f.mine && !needsMe(d)) return false;
  if (f.next && d.next_action_key !== f.next) return false;
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = [opportunityName(d), d.company?.name, d.founder?.full_name].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// The deals of each column, in the Dashboard deck's order (what needs you first,
// then longest waiting, then id).
export function columns(deals: PipelineDeal[]): Record<(typeof DEAL_STAGES)[number], PipelineDeal[]> {
  const sorted = sortDeals(deals);
  return {
    screening: sorted.filter((d) => d.stage === "screening"),
    diligence: sorted.filter((d) => d.stage === "diligence"),
    decision: sorted.filter((d) => d.stage === "decision"),
  };
}

// The board read in order, column by column: what J/K and the arrow keys step through.
export const boardOrder = (deals: PipelineDeal[]) => DEAL_STAGES.flatMap((s) => columns(deals)[s]);

// The list view's sortable columns.
export type ListSort = "queue" | "waiting" | "fit" | "score" | "stage";
export function sortList(deals: PipelineDeal[], by: ListSort, dir: "asc" | "desc"): PipelineDeal[] {
  const queue = sortDeals(deals);
  if (by === "queue") return queue;
  const key = (d: PipelineDeal): number =>
    by === "waiting" ? d.age_days
    : by === "fit" ? (d.company ? d.thesis_fit_score : -1)
    : by === "score" ? (d.founder_score?.score ?? -1)
    : DEAL_STAGES.indexOf(d.stage as (typeof DEAL_STAGES)[number]);
  // ties keep the queue order
  const rank = new Map(queue.map((d, i) => [d.id, i]));
  return [...queue].sort((a, b) => (dir === "asc" ? key(a) - key(b) : key(b) - key(a)) || rank.get(a.id)! - rank.get(b.id)!);
}
