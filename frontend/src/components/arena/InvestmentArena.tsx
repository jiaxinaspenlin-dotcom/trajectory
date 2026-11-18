"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Debate, DiligenceQuestion } from "@/lib/types";
import { asSentence, humanStatus, labelPhrase } from "@/lib/format";
import { evidenceHref } from "@/lib/pipeline";
import { debateTurns, isStrongest, leanLabel, Point, refereePosition, relatedPoints, replayPosition, Side, Turn } from "@/lib/arena";
import { useSeen } from "@/lib/motion";
import { Button, ConfidenceBar, DemoBadge, Segmented } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { BearCharacter, BullCharacter, CharState, RefereeCharacter } from "./Characters";

export interface RecordedDecision {
  decision: string;
  chosen_action: string;
  decided_by: string;
  decided_at: string;
}

const SIDES: Record<Side, { name: string; title: string; tone: string; bar: string; Avatar: typeof BullCharacter }> = {
  bull: { name: "Bull", title: "Case to Advance", tone: "text-bull", bar: "bg-bull", Avatar: BullCharacter },
  bear: { name: "Bear", title: "Case for Caution", tone: "text-bear", bar: "bg-bear", Avatar: BearCharacter },
};
const TURN_MS = 1800;

// The argument is the page: where the Referee landed and why, then both sides in
// full, then the Referee's reasoning. Nothing waits on hover; Replay Debate plays
// the same content in place, one turn at a time, and never hides it afterwards.
export function InvestmentArena({
  debate, opportunityId, diligence = [], decision = null, decideHref, memoHref,
  onRunAnalysis, analysisBusy = false, analysisError = null, compact = false,
}: {
  debate: Debate | null;
  opportunityId: number;
  diligence?: DiligenceQuestion[];
  // the latest recorded decision on this record, if any
  decision?: RecordedDecision | null;
  decideHref?: string;
  memoHref?: string;
  onRunAnalysis?: () => void;
  analysisBusy?: boolean;
  analysisError?: string | null;
  // the memo page's read-only copy: no Decide, no replay
  compact?: boolean;
}) {
  if (!debate) {
    return (
      <section className="rounded-2xl bg-surface-sunken px-6 py-8 sm:px-8" data-testid="arena-empty" aria-labelledby="arena-empty-title">
        <div className="flex items-center gap-2" aria-hidden>
          <BullCharacter size={36} /><RefereeCharacter size={36} /><BearCharacter size={36} />
        </div>
        <h2 id="arena-empty-title" className="mt-3 text-title text-ink">No Debate Yet</h2>
        <p className="mt-1 max-w-xl text-body text-ink-muted">
          Running analysis has the Bull and the Bear argue from the stored evidence, and the Referee recommend what to do next.
        </p>
        {onRunAnalysis && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={onRunAnalysis} busy={analysisBusy}>Run Analysis</Button>
            {analysisBusy && <span className="text-meta text-ink-muted" role="status">Scoring the three screening axes and writing the debate… this can take a minute.</span>}
          </div>
        )}
        {analysisError && <p className="field-error" role="alert">{analysisError}</p>}
      </section>
    );
  }
  return <Debated {...{ debate, opportunityId, diligence, decision, decideHref, memoHref, compact }} />;
}

function Debated({ debate, opportunityId, diligence, decision, decideHref, memoHref, compact }: {
  debate: Debate; opportunityId: number; diligence: DiligenceQuestion[]; decision: RecordedDecision | null;
  decideHref?: string; memoHref?: string; compact: boolean;
}) {
  const points: Record<Side, Point[]> = {
    bull: debate.arguments.find((a) => a.role === "bull")?.points ?? [],
    bear: debate.arguments.find((a) => a.role === "bear")?.points ?? [],
  };
  const headline: Record<Side, string> = {
    bull: debate.arguments.find((a) => a.role === "bull")?.headline ?? "",
    bear: debate.arguments.find((a) => a.role === "bear")?.headline ?? "",
  };
  const referee = debate.referee;
  const final = referee ? refereePosition(referee.recommended_action, referee.confidence) : 50;
  const turns = useMemo(() => debateTurns(points.bull, points.bear), [debate]); // eslint-disable-line react-hooks/exhaustive-deps

  // replay: null when not playing (everything shown)
  const [replay, setReplay] = useState<{ step: number; playing: boolean } | null>(null);
  const controls = useRef<HTMLDivElement>(null);
  const turn: Turn | null = replay ? turns[replay.step] : null;
  useEffect(() => {
    if (!replay?.playing) return;
    const t = setTimeout(() => {
      setReplay((r) => (!r ? r : r.step >= turns.length - 1 ? null : { ...r, step: r.step + 1 }));
    }, TURN_MS);
    return () => clearTimeout(t);
  }, [replay, turns.length]);
  const start = () => { setReplay({ step: 0, playing: true }); setTimeout(() => controls.current?.querySelector<HTMLElement>("[data-replay=toggle]")?.focus()); };
  const go = (step: number) => setReplay((r) => (step >= turns.length ? null : { playing: r?.playing ?? false, step: Math.max(0, step) }));
  const skip = () => setReplay(null);
  function onReplayKey(e: KeyboardEvent) {
    if (!replay) return;
    if (e.key === " ") { e.preventDefault(); setReplay({ ...replay, playing: !replay.playing }); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(replay.step + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(replay.step - 1); }
    else if (e.key === "End" || e.key === "Escape") { e.preventDefault(); skip(); }
  }
  // which turn a point is spoken on, to hide what hasn't been said yet in a replay
  const turnOf = (side: Side, index: number) => turns.findIndex((t) => t.side === side && "index" in t && t.index === index);
  const said = (side: Side, index: number) => !replay || turnOf(side, index) <= replay.step;
  const position = replay ? replayPosition(turns, replay.step, final) : final;

  // phones show one side at a time; a replay follows the side speaking
  const [phoneSide, setPhoneSide] = useState<Side>("bull");
  const shownSide: Side = turn && turn.side !== "referee" ? turn.side : phoneSide;

  // a hovered or focused point, and the points on the other side about the same thing
  const [focus, setFocus] = useState<{ side: Side; index: number } | null>(null);
  const related = focus ? relatedPoints(points[focus.side][focus.index], points[focus.side === "bull" ? "bear" : "bull"]) : [];

  const updatedAfter = decision && debate.computed_at && new Date(debate.computed_at) > new Date(decision.decided_at);
  const questionLink = (text: string) => {
    const q = diligence.find((d) => d.question.includes(text.replace(/^Contradiction:\s*/, "").slice(0, 60)));
    return `/vc/opportunities/${opportunityId}/diligence${q ? `#q-${q.id}` : ""}`;
  };

  return (
    <div className="space-y-8" data-testid="arena">
      {/* 1. the verdict, and the one next step */}
      {referee && (
        <section aria-labelledby="arena-verdict" className="rounded-2xl bg-brand-wash p-5 sm:p-6" data-testid="arena-verdict">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar side="referee" state={turn?.side === "referee" ? "decision" : "idle"} />
              <div className="min-w-0">
                <p className="text-meta font-medium text-brand">Referee Recommends</p>
                <h2 id="arena-verdict" className="text-title text-ink">{humanStatus(referee.recommended_action)}</h2>
                <div className="mt-1"><ConfidenceBar value={referee.confidence} /></div>
                <p className="mt-2 max-w-2xl text-[15px] text-ink-soft" data-content>{asSentence(referee.rationale.replace(/^Demo referee:\s*/i, ""))}</p>
              </div>
            </div>
            {!compact && (decision ? (
              <div className="text-meta text-ink-muted sm:text-right" data-testid="arena-decided">
                <p className="text-[15px] font-medium text-ink">Decided: {humanStatus(decision.chosen_action)}</p>
                <p><span data-content>{decision.decided_by}</span> · {new Date(decision.decided_at).toLocaleDateString()}</p>
                {decideHref && <Link href={decideHref} scroll={false} className="link text-meta">See the Decision</Link>}
              </div>
            ) : decideHref && (
              <Link href={decideHref} scroll={false} className="btn-primary group">Decide<ArrowRightIcon size={16} className="transition-transform duration-base ease-out group-hover:translate-x-0.5" /></Link>
            ))}
          </div>
          {updatedAfter && <p className="mt-3 text-meta text-caution" data-testid="arena-updated">The debate was updated after this decision.</p>}
        </section>
      )}

      {/* 2. where the Referee landed between the two cases */}
      {referee && <Balance position={position} action={referee.recommended_action} replaying={!!replay} />}

      {/* replay, the memo, and what this debate is */}
      <div className="flex flex-wrap items-center justify-between gap-3" data-print-hide>
        {!compact && (replay ? (
          <div ref={controls} role="group" aria-label="Replay Debate" onKeyDown={onReplayKey} className="flex flex-wrap items-center gap-1" data-testid="replay-controls">
            <button type="button" className="btn-ghost btn-sm" onClick={() => go(replay.step - 1)} disabled={replay.step === 0}>Previous</button>
            <button type="button" data-replay="toggle" className="btn-secondary btn-sm min-w-[5.5rem]" onClick={() => setReplay({ ...replay, playing: !replay.playing })}>{replay.playing ? "Pause" : "Play"}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => go(replay.step + 1)}>Next</button>
            <button type="button" className="btn-ghost btn-sm" onClick={skip}>Skip to End</button>
            <span className="num ml-2 text-meta text-ink-muted" aria-live="polite" data-testid="replay-position">Turn {replay.step + 1} of {turns.length}</span>
          </div>
        ) : (
          <button type="button" className="btn-secondary btn-sm" onClick={start} data-testid="replay-start">Replay Debate</button>
        ))}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-muted">
          {debate.generated_by === "demo" && <DemoBadge />}
          <span>v{debate.version}{debate.computed_at ? ` · Generated ${new Date(debate.computed_at).toLocaleDateString()}` : ""}</span>
          {memoHref && <Link href={memoHref} className="link text-meta">Read the Memo</Link>}
        </p>
      </div>

      {/* 3. both cases in full; one at a time on phones */}
      <div>
        <div className="mb-4 md:hidden" data-print-hide>
          <Segmented<Side> label="Which Case" value={shownSide} onChange={setPhoneSide}
            options={(["bull", "bear"] as Side[]).map((s) => ({ value: s, label: `${SIDES[s].name} · ${points[s].length}` }))} />
        </div>
        <div className="grid gap-8 md:grid-cols-2 md:gap-10">
          {(["bull", "bear"] as Side[]).map((side) => (
            <section key={side} aria-labelledby={`arena-${side}`} data-testid={`arena-${side}`}
              className={`${shownSide === side ? "" : "hidden"} md:block print:block`}>
              <div className="flex items-center gap-3">
                <Avatar side={side} state={turn?.side === side ? "speaking" : "idle"} />
                <div className="min-w-0">
                  <h3 id={`arena-${side}`} className={`text-section ${SIDES[side].tone}`}>{SIDES[side].name} · {SIDES[side].title}</h3>
                  {headline[side] && <p className="text-meta text-ink-muted">{labelPhrase(headline[side])}</p>}
                </div>
              </div>
              {points[side].length ? (
                <ol className="mt-3 space-y-1">
                  {points[side].map((p, i) => {
                    const other: Side = side === "bull" ? "bear" : "bull";
                    const link = focus && focus.side === other ? related.find((r) => r.index === i) : undefined;
                    const isFocus = focus?.side === side && focus.index === i;
                    const dim = focus?.side === side && !isFocus;
                    const speaking = turn && turn.side === side && "index" in turn && turn.index === i;
                    return (
                      <li key={i}
                        className={`relative -mx-3 rounded-lg px-3 py-3 transition-[opacity,background-color] duration-base ${said(side, i) ? (speaking ? "animate-rise bg-surface-sunken" : "") : "invisible"} ${dim ? "opacity-60" : ""} ${isFocus || speaking ? "bg-surface-sunken" : ""} ${link ? "bg-brand-wash ring-1 ring-brand/30" : ""}`}
                        onMouseEnter={() => setFocus({ side, index: i })} onMouseLeave={() => setFocus(null)}
                        onFocus={() => setFocus({ side, index: i })} onBlur={() => setFocus(null)}
                        tabIndex={p.evidence_ids.length ? undefined : 0}
                        data-testid={`point-${side}-${i}`}
                      >
                        <p className="text-[15px] leading-6 text-ink" data-content>{asSentence(p.text)}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta">
                          {isStrongest(p, side === "bull" ? referee?.strongest_bull_point : referee?.strongest_bear_point) && (
                            <span className="chip bg-brand-wash text-brand">Strongest Point</span>
                          )}
                          {(p.unverified || !p.evidence_ids.length) && <span className="chip bg-caution-wash text-caution">Unverified</span>}
                          {p.evidence_ids.length > 0 && (
                            <Link href={evidenceHref(opportunityId, p.evidence_ids[0])} scroll={false} className="link text-meta">
                              {p.evidence_ids.length === 1 ? "1 Evidence Item" : `${p.evidence_ids.length} Evidence Items`}
                            </Link>
                          )}
                          {link && <span className="chip bg-white text-brand" data-testid="point-link">{link.why}</span>}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">The {SIDES[side].name} made no points in this debate.</p>
              )}
            </section>
          ))}
        </div>
      </div>

      {/* 4. the Referee's reasoning */}
      {referee && (
        <section aria-labelledby="arena-referee" data-testid="arena-referee"
          className={`border-t border-line pt-6 transition-opacity duration-base ${replay && turn?.side !== "referee" ? "opacity-40" : ""}`}>
          <h3 id="arena-referee" className="text-section text-referee">Referee</h3>
          <p className="mt-1 text-meta text-ink-muted">The Referee judges evidence quality and independence, not who argued more persuasively.</p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <p className="label">What Would Change the Call</p>
              <p className="mt-1 text-[15px] text-ink-soft" data-content>{asSentence(referee.evidence_that_would_change)}</p>
            </div>
            {referee.unresolved_questions.length > 0 && (
              <div>
                <p className="label">Open Questions</p>
                <ul className="mt-1 space-y-1.5">
                  {referee.unresolved_questions.map((q, i) => (
                    <li key={i} className="text-[15px] text-ink-soft">
                      <span data-content>{asSentence(q)}</span> <Link href={questionLink(q)} className="link whitespace-nowrap text-meta">See the Question</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {referee.required_diligence.length > 0 && (
              <div>
                <p className="label">Required Diligence</p>
                <ul className="mt-1 space-y-1.5">
                  {referee.required_diligence.map((q, i) => <li key={i} className="text-[15px] text-ink-soft">{labelPhrase(q)}</li>)}
                </ul>
                <Link href={`/vc/opportunities/${opportunityId}/diligence`} className="link mt-2 inline-block text-meta">Open Diligence</Link>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// The bar from Advance to Caution with the Referee's marker. It moves in from the
// middle the first time it's seen, and follows the argument during a replay.
function Balance({ position, action, replaying }: { position: number; action: string; replaying: boolean }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const at = seen ? position : 50;
  return (
    <section aria-label="Where the Referee Landed" data-testid="arena-balance" ref={ref}>
      <div className="flex items-center justify-between text-meta font-medium">
        <span className="text-bull">Advance</span>
        <span className="text-ink-muted">{replaying ? "Following the Argument" : leanLabel(action)}</span>
        <span className="text-bear">Caution</span>
      </div>
      {/* clipped sideways (with room for the marker at either end), so the moved layer never widens the page */}
      <div className="-mx-2.5 mt-2 px-2.5 [overflow-x:clip]">
      <div className="relative h-2 rounded-full bg-gradient-to-r from-bull/25 via-line to-bear/25" role="img"
        aria-label={`${replaying ? "Following the Argument" : leanLabel(action)}, ${Math.round(at)}% of the Way from Advance to Caution`}>
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
        {/* a full-width layer moved by the position (a percentage of the track),
            carrying the marker centered on its left edge: only transform animates */}
        <span aria-hidden data-testid="balance-marker" data-position={Math.round(position)}
          className="absolute inset-0 transition-transform duration-[500ms] ease-out" style={{ transform: `translateX(${at}%)` }}>
          <span className="absolute left-0 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-referee shadow-raised" />
        </span>
      </div>
      </div>
    </section>
  );
}

function Avatar({ side, state }: { side: Side | "referee"; state: CharState }) {
  const Comp = side === "referee" ? RefereeCharacter : SIDES[side].Avatar;
  return (
    <span aria-hidden className={`press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white shadow-card transition-transform duration-base ease-out hover:-translate-y-0.5 ${
      state === "speaking" || state === "decision" ? "scale-110 ring-2 ring-brand/30" : ""}`}>
      <Comp size={40} state={state} />
    </span>
  );
}
