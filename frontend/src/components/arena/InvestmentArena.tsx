"use client";

import { useState } from "react";
import { Debate, Memo } from "@/lib/types";
import { asSentence, humanStatus, labelPhrase, pct } from "@/lib/format";
import { MemoView } from "@/components/MemoView";
import { Button } from "@/components/ui";
import { BullCharacter, BearCharacter, RefereeCharacter, CharState } from "./Characters";
import { DebatePlayer } from "./DebatePlayer";
import { ArenaBackdrop, Emblem, Flourish, Pedestal, RefereeBadge } from "./stage";
import { EvidenceRef } from "../EvidenceRef";

type Role = "bull" | "bear" | "referee";

const ROLE_META: Record<Role, { name: string; sub: string; color: string }> = {
  bull: { name: "Bull", sub: "Optimistic Case", color: "text-bull" },
  referee: { name: "Referee", sub: "Neutral Judge", color: "text-referee" },
  bear: { name: "Bear", sub: "Skeptical Case", color: "text-bear" },
};

function EvidenceRefs({ ids }: { ids: number[] }) {
  if (!ids.length) return <span className="ml-1 text-xs text-caution">Unverified</span>;
  return (
    <span className="ml-1 text-xs text-ink-muted">
      {ids.slice(0, 6).map((id) => (
        <EvidenceRef key={id} id={id} />
      ))}
    </span>
  );
}

export function InvestmentArena({
  debate,
  expandable = true,
  memo,
  onGenerateMemo,
  memoBusy = false,
}: {
  debate: Debate | null;
  expandable?: boolean;
  memo?: Memo | null;
  onGenerateMemo?: () => void;
  memoBusy?: boolean;
}) {
  const [pinned, setPinned] = useState<Role | null>(null);
  const [hovered, setHovered] = useState<Role | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  // whether this instance should render the inline memo drawer at all
  const showMemoDrawer = memo !== undefined;

  if (!debate) {
    return (
      <div className="card mx-auto w-full max-w-[1100px] overflow-hidden" data-testid="arena-empty">
        <div className="relative">
          <ArenaBackdrop />
          <div className="relative z-10 px-4 py-6 text-center">
            <div className="flex justify-center"><Emblem /></div>
            <h3 className="mt-1 text-lg font-semibold text-ink">Investment Arena</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
              No debate generated yet. Run analysis to let the Bull, Bear, and Referee weigh the evidence.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const bull = debate.arguments.find((a) => a.role === "bull");
  const bear = debate.arguments.find((a) => a.role === "bear");
  const referee = debate.referee;

  const bubbleFor = (role: Role): string => {
    if (role === "bull") return bull?.speech_bubble || "Strongest case to advance.";
    if (role === "bear") return bear?.speech_bubble || "Strongest case for caution.";
    return referee?.speech_bubble || "Weighing evidence quality.";
  };

  const active = pinned ?? hovered;
  const stateFor = (role: Role): CharState => {
    if (pinned === role) return "selected";
    if (hovered === role) return role === "referee" ? "decision" : "speaking";
    return "idle";
  };

  const Character = ({ role }: { role: Role }) => {
    const Comp = role === "bull" ? BullCharacter : role === "bear" ? BearCharacter : RefereeCharacter;
    const meta = ROLE_META[role];
    const show = active === role;
    const size = role === "referee" ? 118 : 96;
    return (
      <div className="flex flex-col items-center">
        <div className="relative">
          {/* speech bubble on hover / focus / pin */}
          {show && (
            <div
              role="status"
              className="absolute bottom-full left-1/2 z-20 mb-2 w-48 -translate-x-1/2 rounded-lg border border-line bg-white p-2 text-center text-xs text-ink-soft shadow-raised"
            >
              {bubbleFor(role)}
              <div className="mx-auto -mb-1 mt-1 h-2 w-2 rotate-45 border-b border-r border-line bg-white" />
            </div>
          )}
          {role === "referee" && <RefereeBadge />}
          <button
            type="button"
            aria-pressed={pinned === role}
            aria-label={`${meta.name}. ${bubbleFor(role)} Activate to pin the detailed analysis.`}
            className="press rounded-xl transition-transform duration-base ease-out hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            onMouseEnter={() => setHovered(role)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(role)}
            onBlur={() => setHovered(null)}
            onClick={() => setPinned((p) => (p === role ? null : role))}
            data-testid={`arena-${role}`}
          >
            <Comp state={stateFor(role)} size={size} />
          </button>
        </div>
        <Pedestal />
        <div className="mt-1 text-center">
          <div className={`text-sm font-bold ${meta.color}`}>{meta.name}</div>
          <div className="text-xs text-ink-muted">{meta.sub}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="card mx-auto w-full max-w-[1100px] overflow-hidden" data-testid="arena">
      {/* illustrated stage with interactive characters */}
      <div className="relative">
        <ArenaBackdrop />
        <div className="relative z-10 px-4 pb-5 pt-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">{`v${debate.version} · ${humanStatus(debate.generated_by)}`}</span>
            {expandable && (
              <button className="btn-ghost text-xs" onClick={() => setExpanded(true)}>Expand Full Debate ↗</button>
            )}
          </div>

          <div className="mt-1 flex justify-center"><Emblem /></div>
          <div className="flex items-center justify-center gap-3">
            <Flourish side="left" />
            <h3 className="text-center text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Investment Arena</h3>
            <Flourish side="right" />
          </div>
          <p data-print-hide className="mt-1 text-center text-xs text-ink-muted">
            Hover or focus a character for its case; click to pin the full analysis.
          </p>

          <div className="mx-auto mt-4 grid max-w-xl grid-cols-3 items-end gap-1 sm:gap-3">
            <Character role="bull" />
            <Character role="referee" />
            <Character role="bear" />
          </div>
        </div>
      </div>

      {/* referee recommendation */}
      {referee && (
        <div className="border-t border-line bg-brand-wash px-5 py-3 text-center">
          <div className="label text-brand">Referee Recommends</div>
          <div className="text-lg font-semibold text-brand">{humanStatus(referee.recommended_action)}</div>
          <div className="text-xs text-ink-muted">
            Confidence {pct(referee.confidence)} ·{" "}
            {referee.final_decision_supportable
              ? "Final Decision Currently Supportable"
              : "Not Yet Decisive — More Evidence Needed"}
          </div>
        </div>
      )}

      {/* pinned detail */}
      <div className="border-t border-line px-5 py-4" data-testid="arena-detail">
        {pinned === "bull" && bull && <SideDetail title="Bull — Case to Advance" tone="text-bull" argument={bull} />}
        {pinned === "bear" && bear && <SideDetail title="Bear — Case for Caution" tone="text-bear" argument={bear} />}
        {pinned === "referee" && referee && <RefereeDetail referee={referee} />}
        {!pinned && (
          <p className="text-sm text-ink-muted">
            Click a character above to pin its full analysis. The Referee judges evidence quality and
            independence — not who argued more persuasively.
          </p>
        )}
      </div>

      {/* inline investment memo drawer */}
      {showMemoDrawer && (
        <div className="border-t border-line" data-testid="arena-memo">
          <button
            type="button"
            className="press flex w-full items-center justify-between px-5 py-3 text-left transition-colors duration-fast hover:bg-surface-sunken"
            aria-expanded={memoOpen}
            onClick={() => setMemoOpen((v) => !v)}
          >
            <span>
              <span className="text-sm font-semibold text-ink">Investment Memo</span>
              <span className="ml-2 text-xs text-ink-muted">
                Full evidence-backed write-up — every standard section, missing data labeled, never invented.
              </span>
            </span>
            <span className={`text-ink-muted transition-transform duration-base ease-out ${memoOpen ? "rotate-180" : ""}`}>▾</span>
          </button>

          {memoOpen && (
            <div className="animate-fade border-t border-line bg-surface-sunken/40 px-5 py-4">
              {memo ? (
                <MemoView memo={memo} />
              ) : (
                <div className="rounded-lg border border-line bg-white p-4 text-sm text-ink-muted">
                  No memo generated yet.{" "}
                  {onGenerateMemo ? (
                    <Button variant="primary" className="ml-1" onClick={onGenerateMemo} busy={memoBusy}>Generate Memo</Button>
                  ) : (
                    <span>Run analysis to generate the full memo.</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* full-screen debate player: VS intro, then turn-taking chat */}
      {expanded && <DebatePlayer debate={debate} onClose={() => setExpanded(false)} />}
    </div>
  );
}

function SideDetail({ title, tone, argument }: { title: string; tone: string; argument: Debate["arguments"][number] }) {
  return (
    <div>
      <h4 className={`text-sm font-semibold ${tone}`}>{title}</h4>
      <p className="mt-1 text-sm font-medium text-ink">{labelPhrase(argument.headline)}</p>
      <ul className="mt-2 space-y-2">
        {argument.points.map((p, i) => (
          <li key={i} className="text-sm text-ink-soft">
            • {asSentence(p.text)}
            <EvidenceRefs ids={p.evidence_ids} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RefereeDetail({ referee }: { referee: NonNullable<Debate["referee"]> }) {
  return (
    <div className="rounded-lg border border-line bg-surface-sunken p-4">
      <h4 className="text-sm font-semibold text-referee">Referee Assessment</h4>
      <p className="mt-1 text-sm text-ink-soft">{referee.rationale}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="label">Strongest Bull Point</dt>
          <dd className="text-sm text-ink-soft">{asSentence(referee.strongest_bull_point)}</dd>
        </div>
        <div>
          <dt className="label">Strongest Bear Point</dt>
          <dd className="text-sm text-ink-soft">{asSentence(referee.strongest_bear_point)}</dd>
        </div>
      </dl>
      {referee.unresolved_questions.length > 0 && (
        <div className="mt-3">
          <div className="label">Unresolved Questions</div>
          <ul className="mt-1 list-inside list-disc text-sm text-ink-soft">
            {referee.unresolved_questions.map((q, i) => <li key={i}>{asSentence(q)}</li>)}
          </ul>
        </div>
      )}
      {referee.required_diligence.length > 0 && (
        <div className="mt-3">
          <div className="label">Required Diligence</div>
          <ul className="mt-1 list-inside list-disc text-sm text-ink-soft">
            {referee.required_diligence.map((q, i) => <li key={i}>{labelPhrase(q)}</li>)}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Evidence That Would Change the Call: <span data-content>{referee.evidence_that_would_change}</span>
      </p>
    </div>
  );
}
