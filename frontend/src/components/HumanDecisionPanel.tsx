"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { humanStatus } from "@/lib/format";
import { LocalDecision } from "@/lib/myWorkspace";
import { useFetch } from "@/lib/useFetch";
import { Choice, confirmLabel, decisionPayload, decisionSummary, Reason } from "@/lib/decision";
import { cardHref, DeckItem } from "@/lib/deck";
import { Button, ConfidenceBar, Skeleton } from "./ui";
import { AlertIcon, ArrowRightIcon, CheckIcon } from "./icons";

const ACTIONS = [
  "Invite to Apply", "Schedule Interview", "Request Information",
  "Continue Diligence", "Monitor", "Invest", "Pass",
];

interface HistoryItem {
  decision: string;
  chosen_action: string;
  system_recommended_action: string | null;
  decided_by: string;
  decided_at: string;
  notes: string;
}

// The Decision step: why the system recommends what it does, then one question
// ("Do You Agree?") with nothing chosen to start. Only "Choose a Different
// Action" asks for an action. Nothing is recorded without an explicit choice,
// and nothing is sent or invested automatically. After recording, the next card
// in the Dashboard deck is one click away.
export function HumanDecisionPanel({
  opportunityId,
  recommendation,
  why,
  onDecision,
  savedLocal = null,
  onSavedLocal,
  next,
  dashboardHref = "/vc",
}: {
  opportunityId: number;
  recommendation: { action: string; confidence: number; rationale: string } | null;
  why?: { reasons: Reason[]; risk: Reason | null };
  onDecision: () => void;
  // the decision this browser previously recorded for this opportunity, if any
  savedLocal?: LocalDecision | null;
  onSavedLocal?: (d: LocalDecision) => void;
  // the card after this one in the Dashboard deck (null: none left; undefined: not known yet)
  next?: DeckItem | null;
  dashboardHref?: string;
}) {
  const rec = recommendation?.action ?? null;
  const [choice, setChoice] = useState<Choice | null>(null);
  const [picked, setPicked] = useState("");
  const [decidedBy, setDecidedBy] = useState("Demo Investor");
  const [editingBy, setEditingBy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState<LocalDecision | null>(savedLocal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const history = useFetch<{ items: HistoryItem[] }>(`/api/opportunities/${opportunityId}/decisions`);
  const firstChoice = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const byRef = useRef<HTMLInputElement>(null);

  const missing =
    !choice ? "Choose an answer above first."
    : choice === "different" && !picked ? "Pick the action you'd take instead."
    : !decidedBy.trim() ? "Enter who is deciding."
    : null;

  async function submit() {
    setTried(true);
    if (missing) {
      if (!choice) firstChoice.current?.focus();
      else if (choice === "different" && !picked) pickerRef.current?.focus();
      else { setEditingBy(true); setTimeout(() => byRef.current?.focus()); }
      return;
    }
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ human_decision: LocalDecision }>(`/api/opportunities/${opportunityId}/decision`, {
        decided_by: decidedBy.trim(), ...decisionPayload(choice!, rec, picked), notes,
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
    setChoice(null);
    setPicked("");
    setTried(false);
  }

  const choices: { value: Choice; title: React.ReactNode; hint: string }[] = [
    ...(rec ? [{ value: "agree" as const, title: <>Agree: {humanStatus(rec)}</>, hint: `Records your approval of ${humanStatus(rec)}. Nothing is sent automatically.` }] : []),
    { value: "different", title: rec ? "Choose a Different Action" : "Choose an Action", hint: rec ? "Pick the action you'd take instead." : "Pick the action you'd take." },
    { value: "not_now", title: "Not Now", hint: "Records that you'll decide later. Nothing else changes." },
    { value: "pass", title: "Pass", hint: "Records a pass. The founder isn't contacted." },
  ];

  return (
    <div data-testid="human-decision" className="space-y-8">
      {/* 1. why: the recommendation and what it rests on */}
      <section aria-labelledby={`why-${opportunityId}`} className="rounded-2xl bg-surface-sunken p-5 sm:p-6">
        <p id={`why-${opportunityId}`} className="label">The Recommendation</p>
        {recommendation ? (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-title text-ink">{humanStatus(recommendation.action)}</p>
              <ConfidenceBar value={recommendation.confidence} />
            </div>
            {why && why.reasons.length > 0 ? (
              <ul className="mt-4 space-y-2.5" aria-label="Reasons" data-testid="decision-reasons">
                {why.reasons.map((r, i) => <ReasonLine key={i} r={r} />)}
              </ul>
            ) : <p className="mt-3 text-sm text-ink-muted">No reasons are recorded for this recommendation yet. Run analysis to get them, or look at the evidence yourself.</p>}
            {why?.risk && (
              <div className="mt-4 border-t border-line pt-4" data-testid="decision-risk">
                <p className="label">Main Risk</p>
                <ul className="mt-1.5"><ReasonLine r={why.risk} risk /></ul>
              </div>
            )}
          </>
        ) : <p className="mt-1 text-sm text-ink-muted">No recommendation yet. Run analysis to get one, or choose an action yourself.</p>}
      </section>

      {saved ? (
        // 3. done: what was recorded, and on to the next card
        <div className="animate-rise rounded-2xl bg-positive-wash p-5 sm:p-6" role="status" data-testid="decision-recorded">
          <p className="flex items-center gap-2 text-section text-positive">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-positive text-white"><CheckIcon size={14} className="check-draw" /></span>
            Decision Recorded
          </p>
          <p className="mt-2 text-body text-ink-soft"><span data-content>{saved.decided_by}</span> {decisionSummary(saved)}</p>
          {saved.notes && <p className="mt-1 text-[13px] text-ink-muted">Note: <span data-content>{saved.notes}</span></p>}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {next && (
              <Link href={cardHref(next)} className="btn-primary group">
                Next: <span data-content>{next.name}</span>
                <ArrowRightIcon size={16} className="transition-transform duration-base ease-out group-hover:translate-x-0.5" />
              </Link>
            )}
            <Link href={dashboardHref} className={next === null ? "btn-primary" : "btn-secondary"}>Back to Dashboard</Link>
            <button type="button" className="btn-ghost btn-sm ml-auto" onClick={amend}>Change Decision</button>
          </div>
          {next === null && <p className="mt-3 text-[13px] text-ink-muted">That was the last waiting record.</p>}
        </div>
      ) : (
        // 2. one question
        <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-6">
          <fieldset>
            <legend className="text-title text-ink">Do You Agree?</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Do You Agree?">
              {choices.map((c, i) => {
                const on = choice === c.value;
                const dim = choice !== null && !on;
                return (
                  <label key={c.value} data-testid={`choice-${c.value}`}
                    className={`choice-card group relative flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${
                      on ? "border-brand bg-brand-wash" : dim ? "border-transparent bg-surface-sunken" : tried && !choice ? "border-negative/40 bg-white" : "border-line bg-white"}`}>
                    <input ref={i === 0 ? firstChoice : undefined} type="radio" name={`choice-${opportunityId}`} value={c.value} checked={on}
                      onChange={() => { setChoice(c.value); setError(null); }} className="sr-only" />
                    <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-fast ${on ? "border-brand bg-brand text-white" : "border-line-strong bg-white"}`}>
                      {on && <CheckIcon size={11} className="check-draw" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-ink">{c.title}</span>
                      <span className="mt-0.5 block text-[13px] text-ink-muted">{c.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {choice === "different" && (
            <fieldset className="animate-rise" data-testid="action-picker">
              <legend className="label">{rec ? "Which Action Instead?" : "Which Action?"}</legend>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={rec ? "Which Action Instead?" : "Which Action?"}>
                {/* Pass has its own answer above */}
                {ACTIONS.filter((a) => a !== rec && a !== "Pass").map((a, i) => (
                  <label key={a} className={`press cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-fast ${
                    picked === a ? "border-brand bg-brand text-white" : "border-line-strong bg-white text-ink-soft hover:border-ink-faint/60 hover:text-ink"}`}>
                    <input ref={i === 0 ? pickerRef : undefined} type="radio" name={`action-${opportunityId}`} value={a} checked={picked === a} onChange={() => setPicked(a)} className="sr-only" />
                    {humanStatus(a)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="space-y-2 text-[13px] text-ink-muted">
            {noteOpen ? (
              <div className="animate-rise">
                <label htmlFor={`notes-${opportunityId}`} className="label">Note <span className="font-normal text-ink-muted">(Optional)</span></label>
                <textarea id={`notes-${opportunityId}`} className="textarea mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus />
              </div>
            ) : (
              <button type="button" className="link text-[13px]" onClick={() => setNoteOpen(true)}>Add a Note</button>
            )}
            {editingBy ? (
              <div className="animate-rise">
                <label htmlFor={`by-${opportunityId}`} className="label">Deciding As</label>
                <input id={`by-${opportunityId}`} ref={byRef} className="input mt-1 max-w-xs" aria-invalid={tried && !decidedBy.trim()} value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} />
              </div>
            ) : (
              <p>Deciding as <span className="text-ink-soft" data-content>{decidedBy}</span> · <button type="button" className="link text-[13px]" onClick={() => { setEditingBy(true); setTimeout(() => byRef.current?.focus()); }}>Change</button></p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[13px] text-ink-muted">Recorded apart from the recommendation. Nothing is sent or invested automatically.</p>
            <Button type="submit" variant="primary" busy={busy} aria-disabled={!!missing} className={missing ? "opacity-60" : ""} data-testid="confirm-decision">
              <span key={confirmLabel(choice, rec && humanStatus(rec), picked && humanStatus(picked))} className="animate-fade">{confirmLabel(choice, rec && humanStatus(rec), picked && humanStatus(picked))}</span>
            </Button>
            {tried && missing && <p className="field-error" role="alert">{missing}</p>}
            {error && <p className="field-error" role="alert">{error}</p>}
          </div>
        </form>
      )}

      <History items={history.data?.items ?? null} loading={history.loading && !history.data} id={opportunityId} />
    </div>
  );
}

function ReasonLine({ r, risk = false }: { r: Reason; risk?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-[15px] leading-6 text-ink-soft">
      <span aria-hidden className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full ${risk ? "text-caution" : "bg-positive text-white"}`}>
        {risk ? <AlertIcon size={16} /> : <CheckIcon size={10} />}
      </span>
      <span className="min-w-0">
        <span data-content>{r.text}</span>
        {r.unverified && <span className="chip ml-2 bg-caution-wash text-caution">Unverified</span>}
        {r.href && <> <Link href={r.href} className="link whitespace-nowrap text-[13px]">{r.linkLabel}</Link></>}
      </span>
    </li>
  );
}

// The latest decision, with the rest behind "Show All".
function History({ items, loading, id }: { items: HistoryItem[] | null; loading: boolean; id: number }) {
  const [all, setAll] = useState(false);
  const list = items ? [...items].reverse() : [];
  return (
    <section aria-labelledby={`history-${id}`} className="border-t border-line pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`history-${id}`} className="text-[15px] font-semibold text-ink">Decision History</h3>
        {list.length > 1 && <button type="button" className="link text-[13px]" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? "Show Latest Only" : `Show All (${list.length})`}</button>}
      </div>
      {loading ? <div className="mt-2 space-y-2" role="status" aria-label="Loading History…"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
        : list.length ? (
        <ol className="mt-2 divide-y divide-line" data-testid="decision-history">
          {(all ? list : list.slice(0, 1)).map((h, i) => (
            <li key={i} className="py-2.5 text-sm">
              <span className="font-medium text-ink">{humanStatus(h.decision)}: {humanStatus(h.chosen_action)}</span>
              <span className="text-ink-muted"> · <span data-content>{h.decided_by}</span> · {new Date(h.decided_at).toLocaleDateString()}</span>
              <span className="block text-[13px] text-ink-muted">System Had Recommended: {h.system_recommended_action ? humanStatus(h.system_recommended_action) : "—"}{h.notes && <> · <span data-content>{h.notes}</span></>}</span>
            </li>
          ))}
        </ol>
      ) : <p className="mt-1 text-sm text-ink-muted">No decisions recorded yet.</p>}
    </section>
  );
}
