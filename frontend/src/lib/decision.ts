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
}

// Actions that move a deal forward: their reasons are the bull case and their risk
// the bear case. For a cautious action (Monitor, Pass) it's the other way round.
const ADVANCING = new Set(["Continue Diligence", "Invest", "Schedule Interview", "Invite to Apply", "Request Information"]);

// "0 material claim(s) are founder-reported…" says nothing: it isn't a reason.
const vacuous = (text: string) => /^0\s/.test(text.trim());

export function decisionReasons(o: Pick<Opportunity, "id" | "debate" | "diligence">, action: string | null): { reasons: Reason[]; risk: Reason | null } {
  const args = o.debate?.arguments ?? [];
  const advancing = action ? ADVANCING.has(action) : true;
  const forSide = args.find((a) => a.role === (advancing ? "bull" : "bear"));
  const againstSide = args.find((a) => a.role === (advancing ? "bear" : "bull"));
  const openQuestions = (o.diligence ?? []).filter((q) => q.status === "open");

  const toReason = (p: { text: string; evidence_ids: number[]; unverified?: boolean }): Reason => {
    if (p.evidence_ids.length) {
      return { text: p.text, href: evidenceHref(o.id, p.evidence_ids[0]), linkLabel: p.evidence_ids.length === 1 ? "See Evidence" : `See Evidence (${p.evidence_ids.length})`, unverified: !!p.unverified };
    }
    // a contradiction or a claim lives on the Claims tab; an open question on Diligence
    const question = openQuestions.find((q) => q.question.includes(p.text.replace(/^Contradiction:\s*/, "").slice(0, 60)));
    if (question) return { text: p.text, href: `/vc/opportunities/${o.id}/diligence`, linkLabel: "See the Open Question", unverified: !!p.unverified };
    if (/contradict|claim/i.test(p.text)) return { text: p.text, href: `/vc/opportunities/${o.id}?tab=claims`, linkLabel: "See the Claims", unverified: !!p.unverified };
    return { text: p.text, href: null, linkLabel: null, unverified: !!p.unverified };
  };

  const supporting = (forSide?.points ?? []).filter((p) => !vacuous(p.text));
  // evidence-backed reasons first
  const reasons = [...supporting].sort((a, b) => Number(!!b.evidence_ids.length) - Number(!!a.evidence_ids.length)).slice(0, 3).map(toReason);
  const against = (againstSide?.points ?? []).find((p) => !vacuous(p.text));
  const risk = against
    ? toReason(against)
    : openQuestions[0]
    ? { text: openQuestions[0].question, href: `/vc/opportunities/${o.id}/diligence`, linkLabel: "See the Open Question", unverified: false }
    : null;
  return { reasons, risk };
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
