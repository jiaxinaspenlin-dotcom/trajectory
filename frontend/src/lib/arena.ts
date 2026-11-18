// The Arena: what each side argues, where the Referee landed, and the turns of a
// replay. Everything here reads data the debate already has; nothing is scored.

import { isCautious } from "@/lib/decision";
import { Debate } from "@/lib/types";

export type Side = "bull" | "bear";
export type Point = Debate["arguments"][number]["points"][number];

// Where the Referee's marker sits on the bar from Advance (0) to Caution (100).
// The rule: the recommended action picks the side (an action that moves the deal
// forward leans Advance; Monitor, Request Information or Pass lean Caution), and
// the Referee's own confidence sets how far from the middle, up to the end:
// 50 ∓ confidence × 50. Nothing else goes in, so a 56% Continue Diligence sits at
// 22, a 65% Monitor at 82.5.
export function refereePosition(action: string, confidence: number): number {
  const reach = Math.max(0, Math.min(1, confidence)) * 50;
  // to a tenth: the bar can't show finer, and floating point shouldn't either
  return Math.round((isCautious(action) ? 50 + reach : 50 - reach) * 10) / 10;
}

// "Leans Advance" / "Leans Caution": the words for the marker's side.
export const leanLabel = (action: string) => (isCautious(action) ? "Leans Caution" : "Leans Advance");

// A replay turn: one point from one side, alternating Bull then Bear while both
// have points left, then the Referee's verdict.
export type Turn = { side: Side; index: number } | { side: "referee" };

export function debateTurns(bull: Point[], bear: Point[]): Turn[] {
  const turns: Turn[] = [];
  for (let i = 0; i < Math.max(bull.length, bear.length); i++) {
    if (i < bull.length) turns.push({ side: "bull", index: i });
    if (i < bear.length) turns.push({ side: "bear", index: i });
  }
  turns.push({ side: "referee" });
  return turns;
}

// During a replay the marker follows the points made so far: each point moves it a
// step toward its side, and the verdict sets it where the Referee landed. It shows
// the order of the argument, not a score.
export function replayPosition(turns: Turn[], step: number, final: number): number {
  const done = turns.slice(0, step + 1);
  if (done.some((t) => t.side === "referee")) return final;
  const points = turns.filter((t) => t.side !== "referee").length || 1;
  const lean = done.reduce((n, t) => n + (t.side === "bear" ? 1 : t.side === "bull" ? -1 : 0), 0);
  return 50 + (lean / points) * 40;
}

// Is this the point the Referee names as its side's strongest?
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function isStrongest(point: Point, named: string | undefined): boolean {
  if (!named) return false;
  const a = norm(point.text), b = norm(named);
  return !!a && (a === b || a.startsWith(b) || b.startsWith(a));
}

// Points on the other side about the same thing: they cite the same evidence, or
// they quote the same figure (a number of three or more digits, like "1,200").
export function relatedPoints(point: Point, others: Point[]): { index: number; why: "Same Evidence" | "Same Figure" }[] {
  const figures = (t: string) => new Set((t.match(/\d[\d,.]{2,}\d|\d{3,}/g) ?? []).map((f) => f.replace(/,/g, "")));
  const mine = figures(point.text);
  const out: { index: number; why: "Same Evidence" | "Same Figure" }[] = [];
  others.forEach((o, index) => {
    if (point.evidence_ids.some((id) => o.evidence_ids.includes(id))) out.push({ index, why: "Same Evidence" });
    else if ([...figures(o.text)].some((f) => mine.has(f))) out.push({ index, why: "Same Figure" });
  });
  return out;
}
