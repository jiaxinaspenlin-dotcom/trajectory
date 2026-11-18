// The Decision step: why the system recommends what it does (from what the
// record already holds), and the four answers to "Do You Agree?", each mapped to
// the existing decision contract (outcome + chosen action).

import { evidenceHref } from "@/lib/pipeline";
import { Opportunity } from "@/lib/types";

export interface Reason {
  text: string;
  href: string | null;
  linkLabel: string | null;
  unverified: boolean;
  // what kind of point it is, whichever block it sits in: a strength (bull) or a
  // concern (bear); its mark follows this, not the block
  tone: "strength" | "concern";
}

// Cautious actions are backed by the concerns (the bear case) and could be changed
// by the strengths; actions that move a deal forward are the other way round.
const CAUTIOUS = new Set(["Monitor", "Request Information", "Request More Information", "Pass"]);
export const isCautious = (action: string | null) => !!action && CAUTIOUS.has(action);

// "0 material claims…" says nothing: it isn't a point either way.
const vacuous = (text: string) => /^0\s/.test(text.trim());

export function decisionReasons(o: Pick<Opportunity, "id" | "debate" | "diligence">, action: string | null): { reasons: Reason[]; counter: Reason | null } {
  const args = o.debate?.arguments ?? [];
  const cautious = isCautious(action);
  const supportRole = cautious ? "bear" : "bull";
  const openQuestions = (o.diligence ?? []).filter((q) => q.status === "open");

  const toReason = (p: { text: string; evidence_ids: number[]; unverified?: boolean }, role: "bull" | "bear"): Reason => {
    const base = { text: p.text, unverified: !!p.unverified, tone: role === "bull" ? "strength" as const : "concern" as const };
    if (p.evidence_ids.length) {
      return { ...base, href: evidenceHref(o.id, p.evidence_ids[0]), linkLabel: p.evidence_ids.length === 1 ? "See Evidence" : `See Evidence (${p.evidence_ids.length})` };
    }
    // a contradiction or a claim lives on the Claims tab; an open question on Diligence
    const question = openQuestions.find((q) => q.question.includes(p.text.replace(/^Contradiction:\s*/, "").slice(0, 60)));
    if (question) return { ...base, href: `/vc/opportunities/${o.id}/diligence`, linkLabel: "See the Open Question" };
    if (/contradict|claim/i.test(p.text)) return { ...base, href: `/vc/opportunities/${o.id}?tab=claims`, linkLabel: "See the Claims" };
    return { ...base, href: null, linkLabel: null };
  };
  // a side's points, strongest first: backed by evidence, then verified
  const strength = (p: { evidence_ids: number[]; unverified?: boolean }) => (p.evidence_ids.length ? 2 : 0) + (p.unverified ? 0 : 1);
  const points = (role: "bull" | "bear") => (args.find((a) => a.role === role)?.points ?? [])
    .filter((p) => !vacuous(p.text))
    .map((p, i) => ({ p, i }))
    .sort((a, b) => strength(b.p) - strength(a.p) || a.i - b.i)
    .map(({ p }) => p);

  const reasons = points(supportRole).slice(0, 3).map((p) => toReason(p, supportRole));
  const otherRole = cautious ? "bull" : "bear";
  const other = points(otherRole)[0];
  const changeNote = o.debate?.referee?.evidence_that_would_change;
  const counter: Reason | null = other
    ? toReason(other, otherRole)
    // without a point on the other side: for an advancing action the open question
    // is what could change it; otherwise the referee's own note on what would
    : !cautious && openQuestions[0]
    ? { text: openQuestions[0].question, href: `/vc/opportunities/${o.id}/diligence`, linkLabel: "See the Open Question", unverified: false, tone: "concern" }
    : changeNote
    ? { text: changeNote, href: null, linkLabel: null, unverified: false, tone: cautious ? "strength" : "concern" }
    : null;
  return { reasons, counter };
}

export type Choice = "agree" | "different" | "not_now" | "pass";

// What each answer records. Not Now defers the recommended action (or, with no
// recommendation, keeps watching); Pass records a pass. Nothing changes the stage.
export function decisionPayload(choice: Choice, recommended: string | null, picked: string): { decision: string; chosen_action: string } {
  switch (choice) {
    case "agree": return { decision: "approved", chosen_action: recommended ?? picked };
    case "different": return { decision: recommended ? "overridden" : "approved", chosen_action: picked };
    case "not_now": return { decision: "deferred", chosen_action: recommended ?? "Monitor" };
    case "pass": return { decision: "rejected", chosen_action: "Pass" };
  }
}

// The confirm button says what will be recorded.
export function confirmLabel(choice: Choice | null, recommended: string | null, picked: string): string {
  if (!choice) return "Record Your Decision";
  if (choice === "agree") return `Record: ${recommended}`;
  if (choice === "different") return picked ? `Record: ${picked}` : "Record: Choose an Action";
  return choice === "not_now" ? "Record: Not Now" : "Record: Pass";
}

// One line summing up a recorded decision, after the decider's name (which is
// content and rendered on its own).
export function decisionSummary(d: { decision: string; chosen_action: string; system_recommended_action: string | null }): string {
  switch (d.decision) {
    case "approved": return d.system_recommended_action === d.chosen_action ? `agreed: ${d.chosen_action}.` : `chose ${d.chosen_action}.`;
    case "overridden": return `chose a different action: ${d.chosen_action}.`;
    case "deferred": return "chose Not Now, to decide later.";
    case "rejected": return "passed.";
    default: return `recorded ${d.chosen_action}.`;
  }
}
