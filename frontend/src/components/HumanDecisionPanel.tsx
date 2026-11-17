"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { humanStatus } from "@/lib/format";
import { LocalDecision } from "@/lib/myWorkspace";
import { useFetch } from "@/lib/useFetch";
import { Button, Skeleton } from "./ui";
import { CheckIcon } from "./icons";

const ACTIONS = [
  "Invite to Apply", "Schedule Interview", "Request Information",
  "Continue Diligence", "Monitor", "Invest", "Pass",
];

// The outcome is always an explicit choice — nothing is preselected.
const OUTCOMES: { value: string; label: string; hint: string }[] = [
  { value: "approved", label: "Approve", hint: "Go ahead with the chosen action." },
  { value: "rejected", label: "Reject", hint: "Don't take the recommended action." },
  { value: "deferred", label: "Defer", hint: "Decide later." },
  { value: "overridden", label: "Override", hint: "Take a different action than recommended." },
];

interface HistoryItem {
  decision: string;
  chosen_action: string;
  system_recommended_action: string | null;
  decided_by: string;
  decided_at: string;
  notes: string;
}

export function HumanDecisionPanel({
  opportunityId,
  recommendation,
  onDecision,
  savedLocal = null,
  onSavedLocal,
}: {
  opportunityId: number;
  recommendation: { action: string; confidence: number; rationale: string } | null;
  onDecision: () => void;
  // the decision this browser previously recorded for this opportunity, if any
  savedLocal?: LocalDecision | null;
  onSavedLocal?: (d: LocalDecision) => void;
}) {
  const [decision, setDecision] = useState("");
  const [action, setAction] = useState("");
  const [decidedBy, setDecidedBy] = useState("Demo Investor");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState<LocalDecision | null>(savedLocal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const history = useFetch<{ items: HistoryItem[] }>(`/api/opportunities/${opportunityId}/decisions`);
  const outcomeRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef<HTMLSelectElement>(null);
  const byRef = useRef<HTMLInputElement>(null);

  const errors = {
    decision: decision ? null : "Choose an outcome.",
    action: action ? null : "Choose the action you're taking.",
    decidedBy: decidedBy.trim() ? null : "Enter who is deciding.",
  };

  async function submit() {
    setTried(true);
    if (errors.decision) return outcomeRef.current?.focus();
    if (errors.action) return actionRef.current?.focus();
    if (errors.decidedBy) return byRef.current?.focus();
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ human_decision: LocalDecision }>(`/api/opportunities/${opportunityId}/decision`, {
        decided_by: decidedBy.trim(), decision, chosen_action: action, notes,
      });
      setSaved(r.human_decision);
      onSavedLocal?.(r.human_decision);
      onDecision();
      history.reload();
    } catch (e) { setError(e instanceof Error ? `Couldn't record the decision: ${e.message}` : "Couldn't record the decision."); }
    finally { setBusy(false); }
  }

  function amend() {
    setSaved(null);
    setDecision("");
    setAction("");
    setTried(false);
  }

  const err = (k: keyof typeof errors) => (tried ? errors[k] : null);

  return (
    <div data-testid="human-decision" className="space-y-5">
      <div className="rounded-lg bg-surface-sunken p-4">
        <span className="label">System Recommendation</span>
        {recommendation ? (
          <>
            <p className="mt-1 text-base font-semibold text-ink">{humanStatus(recommendation.action)}</p>
            <p className="mt-0.5 text-sm text-ink-muted">{recommendation.rationale}</p>
          </>
        ) : <p className="mt-1 text-sm text-ink-muted">Not generated yet. Run analysis to get a recommendation, or record your own decision.</p>}
      </div>

      {saved ? (
        <div className="animate-rise rounded-xl bg-positive-wash p-4 text-sm" role="status">
          <p className="flex items-center gap-2 font-medium text-positive">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-positive text-white"><CheckIcon size={13} className="check-draw" /></span>
            Decision Recorded
          </p>
          <p className="mt-1.5 text-ink-soft">
            <strong data-content>{saved.decided_by}</strong> chose <strong>{humanStatus(saved.chosen_action)}</strong> ({humanStatus(saved.decision)}).
          </p>
          <p className="text-[13px] text-ink-muted">System had recommended: {saved.system_recommended_action ? humanStatus(saved.system_recommended_action) : "—"}. Recorded separately.</p>
          {saved.notes && <p className="mt-1 text-[13px] text-ink-soft">Notes: <span data-content>{saved.notes}</span></p>}
          <button className="btn-secondary btn-sm mt-3" onClick={amend}>Record Another Decision</button>
        </div>
      ) : (
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <p className="text-[13px] text-ink-muted">Your decision is recorded separately from the system recommendation. No outreach or investment is executed automatically.</p>
          <fieldset aria-describedby={err("decision") ? "decision-error" : undefined}>
            <legend className="label">Outcome <span className="text-negative" aria-hidden>*</span></legend>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {OUTCOMES.map((o, i) => (
                <label key={o.value}
                  className={`press flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors duration-fast ${
                    decision === o.value ? "border-brand bg-brand-wash" : err("decision") ? "border-negative/50" : "border-line-strong hover:border-ink-faint/60 hover:bg-surface-sunken"}`}>
                  <input
                    ref={i === 0 ? outcomeRef : undefined}
                    type="radio"
                    name={`outcome-${opportunityId}`}
                    value={o.value}
                    checked={decision === o.value}
                    onChange={() => setDecision(o.value)}
                    className="mt-1 accent-brand"
                  />
                  <span>
                    <span className="block text-[15px] font-medium text-ink">{o.label}</span>
                    <span className="block text-[13px] text-ink-muted">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {err("decision") && <p id="decision-error" className="field-error">{err("decision")}</p>}
          </fieldset>
          <div>
            <label htmlFor={`action-${opportunityId}`} className="label">Chosen Action <span className="text-negative" aria-hidden>*</span></label>
            {/* stacked on phones, so the chosen action is never cut off beside the button */}
            <div className="mt-1 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <select
                id={`action-${opportunityId}`}
                ref={actionRef}
                className="select w-full min-w-0 sm:flex-1"
                value={action}
                aria-invalid={!!err("action")}
                onChange={(e) => setAction(e.target.value)}
              >
                <option value="" disabled>Choose an Action…</option>
                {ACTIONS.map((a) => <option key={a} value={a}>{humanStatus(a)}{recommendation?.action === a ? " (Recommended)" : ""}</option>)}
              </select>
              {recommendation && action !== recommendation.action && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setAction(recommendation.action)}>Use Recommendation</button>
              )}
            </div>
            {err("action") && <p className="field-error">{err("action")}</p>}
          </div>
          <div>
            <label htmlFor={`by-${opportunityId}`} className="label">Decided By <span className="text-negative" aria-hidden>*</span></label>
            <input id={`by-${opportunityId}`} ref={byRef} className="input mt-1" aria-invalid={!!err("decidedBy")} value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} />
            {err("decidedBy") && <p className="field-error">{err("decidedBy")}</p>}
          </div>
          <div>
            <label htmlFor={`notes-${opportunityId}`} className="label">Notes</label>
            <textarea id={`notes-${opportunityId}`} className="textarea mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" busy={busy}>Record Decision</Button>
        </form>
      )}

      <section aria-labelledby={`history-${opportunityId}`} className="border-t border-line pt-4">
        <h3 id={`history-${opportunityId}`} className="text-[15px] font-semibold text-ink">Decision History</h3>
        {history.loading && !history.data ? <div className="mt-2 space-y-2" role="status" aria-label="Loading History…"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
          : history.data?.items.length ? (
          <ol className="mt-2 divide-y divide-line" data-testid="decision-history">
            {[...history.data.items].reverse().map((h, i) => (
              <li key={i} className="py-2.5 text-sm">
                <span className="font-medium text-ink">{humanStatus(h.decision)}: {humanStatus(h.chosen_action)}</span>
                <span className="text-ink-muted"> · <span data-content>{h.decided_by}</span> · {new Date(h.decided_at).toLocaleDateString()}</span>
                <span className="block text-[13px] text-ink-muted">System Had Recommended: {h.system_recommended_action ? humanStatus(h.system_recommended_action) : "—"}{h.notes && <> · <span data-content>{h.notes}</span></>}</span>
              </li>
            ))}
          </ol>
        ) : <p className="mt-1 text-sm text-ink-muted">No decisions recorded yet.</p>}
      </section>
    </div>
  );
}
