// The Dashboard deck: every waiting record, in the queue's order (priority, then
// longest waiting). The Dashboard flips through it; a record opened from it shows
// where it sits ("3 of 8") and moves on to the next card after a decision.
// Flipping never changes data: it's only which card is in front.

import { nextActionHref } from "@/lib/pipeline";

export type DeckGroup = "recommendation" | "application" | "lead" | "diligence" | "analysis" | "memo";

export interface DeckItem {
  opportunity_id: number;
  name: string;
  founder_name: string | null;
  entry_type: string;
  stage: string;
  next_action: string;
  next_action_key: string;
  next_action_detail: string | null;
  priority: number;
  age_days: number;
  waiting_since: string;
  group: DeckGroup;
}

// One kind of work: the tile label (one / many), what a card says is waiting, and
// the card's one action. Diligence, analysis and memo cards use the queue's own
// wording, which names the exact step ("Resolve 2 Diligence Questions").
export const DECK_GROUPS: Record<DeckGroup, { kind: string; one: string; many: string; waiting?: string; action?: string }> = {
  recommendation: { kind: "Recommendation", one: "Recommendation to Review", many: "Recommendations to Review", action: "Review Recommendation" },
  application: { kind: "Application", one: "Application to Review", many: "Applications to Review", waiting: "New Inbound Application", action: "Review Application" },
  lead: { kind: "Lead", one: "New Lead", many: "New Leads", waiting: "New Lead", action: "Review Lead" },
  diligence: { kind: "Open Diligence", one: "Deal with Open Diligence", many: "Deals with Open Diligence" },
  analysis: { kind: "Analysis", one: "Deal to Analyze", many: "Deals to Analyze" },
  memo: { kind: "Memo", one: "Memo to Generate", many: "Memos to Generate" },
};
export const DECK_ORDER: DeckGroup[] = ["recommendation", "application", "lead", "diligence", "analysis", "memo"];

export const cardAction = (it: DeckItem) => DECK_GROUPS[it.group]?.action ?? it.next_action;
export const cardWaiting = (it: DeckItem) => it.group === "recommendation" ? (it.next_action_detail ?? it.next_action) : DECK_GROUPS[it.group]?.waiting ?? it.next_action;
export const cardSource = (it: DeckItem) => (it.entry_type === "inbound" ? "Inbound" : "Outbound");

export function waitedText(days: number): string {
  return days <= 0 ? "Waiting Since Today" : days === 1 ? "Waiting 1 Day" : `Waiting ${days} Days`;
}

// Where a card's action is done. A recommendation opens the Decision tab; an
// application or a lead opens its record, which leads with that one thing.
// `from=deck` keeps the deck's position strip on the record.
export function cardHref(it: DeckItem): string {
  const base = it.group === "application" || it.group === "lead" ? `/vc/opportunities/${it.opportunity_id}` : nextActionHref(it.opportunity_id, it.next_action_key);
  return `${base}${base.includes("?") ? "&" : "?"}from=deck`;
}

export const dashboardCardHref = (id: number | null | undefined) => (id ? `/vc?card=${id}` : "/vc");

// Counts per kind of work, each with the first card of its kind, in the order the
// kinds first appear in the deck (so the tiles read in the same order as the cards).
export function deckGroups(items: DeckItem[]): { key: DeckGroup; count: number; first: number; names: string[] }[] {
  return DECK_ORDER.map((key) => {
    const members = items.filter((it) => it.group === key);
    return { key, count: members.length, first: items.findIndex((it) => it.group === key), names: members.map((m) => m.name) };
  }).filter((g) => g.count > 0).sort((a, b) => a.first - b.first);
}

// The card after `id` in the deck as it was when the record was opened. If `id`
// isn't in it, the first card that isn't `id`.
export function nextCard(items: DeckItem[], id: number): DeckItem | null {
  const i = items.findIndex((it) => it.opportunity_id === id);
  const rest = i < 0 ? items : items.slice(i + 1);
  return rest.find((it) => it.opportunity_id !== id) ?? null;
}

// After a decision on `id`: the next record that is still waiting according to
// the backend (`now`), in the order the deck was in (`before`). It continues from
// where `id` sat; with nothing left after it, the first still-waiting record. The
// card comes from `now`, so its step and button are current.
export function nextWaiting(before: DeckItem[], now: DeckItem[], id: number): DeckItem | null {
  const waiting = new Map(now.filter((it) => it.opportunity_id !== id).map((it) => [it.opportunity_id, it]));
  const i = before.findIndex((it) => it.opportunity_id === id);
  for (const it of before.slice(i + 1)) if (waiting.has(it.opportunity_id)) return waiting.get(it.opportunity_id)!;
  // records that began waiting since, then anything before `id`
  return now.find((it) => it.opportunity_id !== id && !before.some((b) => b.opportunity_id === it.opportunity_id))
    ?? now.find((it) => it.opportunity_id !== id) ?? null;
}
