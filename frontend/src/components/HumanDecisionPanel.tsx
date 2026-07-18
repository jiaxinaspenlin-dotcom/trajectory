"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "./ui";

const ACTIONS = [
  "Invite to Apply", "Schedule Interview", "Request Information",
  "Continue Diligence", "Monitor", "Invest", "Pass",
];

export function HumanDecisionPanel({
  opportunityId,
  recommendation,
  onDecision,
}: {
  opportunityId: number;
  recommendation: { action: string; confidence: number; rationale: string } | null;
  onDecision: () => void;
}) {
  const [decision, setDecision] = useState("approved");
  const [action, setAction] = useState(recommendation?.action || "Continue Diligence");
  const [decidedBy, setDecidedBy] = useState("Demo Investor");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const r = await api.post<any>(`/api/opportunities/${opportunityId}/decision`, {
        decided_by: decidedBy, decision, chosen_action: action, notes,
      });
      setSaved(r.human_decision);
      onDecision();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <div data-testid="human-decision">
      <div className="rounded-lg bg-surface-sunken p-3">
        <span className="label">System recommendation</span>
        {recommendation ? (
          <>
            <p className="text-sm font-semibold text-ink">{recommendation.action}</p>
            <p className="text-xs text-ink-muted">{recommendation.rationale}</p>
          </>
        ) : <p className="text-sm text-ink-muted">Not generated yet.</p>}
      </div>

      {saved ? (
        <div className="mt-3 rounded-lg border border-positive/30 bg-positive-wash p-3 text-sm">
          <Badge tone="bg-white text-positive">recorded</Badge>
          <p className="mt-1 text-ink-soft">
            <strong>{saved.decided_by}</strong> chose <strong>{saved.chosen_action}</strong> ({saved.decision}).
          </p>
          <p className="text-xs text-ink-muted">System had recommended: {saved.system_recommended_action || "—"}. Recorded separately.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-ink-muted">Your decision is recorded separately from the system recommendation. No outreach or investment is executed automatically.</p>
          <label className="block">
            <span className="label">Decision</span>
            <select className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm" value={decision} onChange={(e) => setDecision(e.target.value)}>
              {["approved", "rejected", "deferred", "overridden"].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Chosen action</span>
            <select className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Decided by</span>
            <input className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm" value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Notes</span>
            <textarea className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error && <p className="text-xs text-negative">{error}</p>}
          <button className="btn-primary w-full" onClick={submit} disabled={busy}>
            {busy ? "Recording…" : "Record human decision"}
          </button>
        </div>
      )}
    </div>
  );
}
