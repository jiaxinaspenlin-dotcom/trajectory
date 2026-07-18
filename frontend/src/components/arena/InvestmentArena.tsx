"use client";

import { useState } from "react";
import { Debate } from "@/lib/types";
import { pct } from "@/lib/format";
import { BullCharacter, BearCharacter, RefereeCharacter, CharState } from "./Characters";

type Role = "bull" | "bear" | "referee";

function EvidenceRefs({ ids }: { ids: number[] }) {
  if (!ids.length) return <span className="ml-1 text-[11px] text-caution">unverified</span>;
  return (
    <span className="ml-1 text-[11px] text-ink-muted">
      {ids.slice(0, 6).map((id) => (
        <span key={id} className="mr-1 rounded bg-surface-sunken px-1 font-mono">E{id}</span>
      ))}
    </span>
  );
}

export function InvestmentArena({ debate, expandable = true }: { debate: Debate | null; expandable?: boolean }) {
  const [pinned, setPinned] = useState<Role | null>(null);
  const [hovered, setHovered] = useState<Role | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (!debate) {
    return (
      <div className="card p-5" data-testid="arena-empty">
        <h3 className="text-sm font-semibold text-ink">Investment Arena</h3>
        <p className="mt-2 text-sm text-ink-muted">
          No debate generated yet. Run analysis to let the Bull, Bear, and Referee weigh the evidence.
        </p>
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

  const Character = ({ role, label }: { role: Role; label: string }) => {
    const Comp = role === "bull" ? BullCharacter : role === "bear" ? BearCharacter : RefereeCharacter;
    const show = active === role;
    return (
      <div className="relative flex flex-1 flex-col items-center">
        {show && (
          <div
            role="status"
            className="absolute -top-2 z-20 w-44 -translate-y-full rounded-lg border border-line bg-white p-2 text-center text-xs text-ink-soft shadow-raised"
          >
            {bubbleFor(role)}
            <div className="mx-auto mt-1 h-2 w-2 rotate-45 border-b border-r border-line bg-white" />
          </div>
        )}
        <button
          type="button"
          aria-pressed={pinned === role}
          aria-label={`${label}. ${bubbleFor(role)} Activate to pin detailed analysis.`}
          className="rounded-xl p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          onMouseEnter={() => setHovered(role)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(role)}
          onBlur={() => setHovered(null)}
          onClick={() => setPinned((p) => (p === role ? null : role))}
          data-testid={`arena-${role}`}
        >
          <Comp state={stateFor(role)} size={84} />
          <span className="mt-1 block text-xs font-semibold text-ink">{label}</span>
        </button>
      </div>
    );
  };

  const detail = (
    <div className="mt-4 border-t border-line pt-4" data-testid="arena-detail">
      {pinned === "bull" && bull && <SideDetail title="Bull — case to advance" tone="text-bull" argument={bull} />}
      {pinned === "bear" && bear && <SideDetail title="Bear — case for caution" tone="text-bear" argument={bear} />}
      {pinned === "referee" && referee && <RefereeDetail referee={referee} />}
      {!pinned && (
        <p className="text-sm text-ink-muted">
          Hover or focus a character for its argument; click to pin the full analysis. The Referee
          judges evidence quality and independence — not who argued more persuasively.
        </p>
      )}
    </div>
  );

  const body = (
    <>
      <div className="flex items-end justify-between gap-2">
        <Character role="bull" label="Bull" />
        <Character role="referee" label="Referee" />
        <Character role="bear" label="Bear" />
      </div>
      {referee && (
        <div className="mt-3 rounded-lg bg-brand-wash p-3 text-center">
          <div className="label text-brand">Referee recommends</div>
          <div className="text-lg font-semibold text-brand">{referee.recommended_action}</div>
          <div className="text-xs text-ink-muted">
            Confidence {pct(referee.confidence)} ·{" "}
            {referee.final_decision_supportable
              ? "final decision currently supportable"
              : "not yet decisive — more evidence needed"}
          </div>
        </div>
      )}
      {detail}
    </>
  );

  return (
    <div className="card p-5" data-testid="arena">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Investment Arena</h3>
        <span className="text-[11px] text-ink-muted">v{debate.version} · {debate.generated_by}</span>
      </div>
      {body}
      {expandable && (
        <button className="btn-ghost mt-3 w-full text-xs" onClick={() => setExpanded(true)}>
          Expand full debate ↗
        </button>
      )}

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Investment Arena full debate"
          onClick={() => setExpanded(false)}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-6 shadow-raised" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink">Investment Arena — Full Debate</h3>
              <button className="btn-secondary" onClick={() => setExpanded(false)}>Close</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {bull && <SideDetail title="Bull — case to advance" tone="text-bull" argument={bull} />}
              {bear && <SideDetail title="Bear — case for caution" tone="text-bear" argument={bear} />}
            </div>
            {referee && <div className="mt-4"><RefereeDetail referee={referee} /></div>}
          </div>
        </div>
      )}
    </div>
  );
}

function SideDetail({ title, tone, argument }: { title: string; tone: string; argument: Debate["arguments"][number] }) {
  return (
    <div>
      <h4 className={`text-sm font-semibold ${tone}`}>{title}</h4>
      <p className="mt-1 text-sm font-medium text-ink">{argument.headline}</p>
      <ul className="mt-2 space-y-2">
        {argument.points.map((p, i) => (
          <li key={i} className="text-sm text-ink-soft">
            • {p.text}
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
      <h4 className="text-sm font-semibold text-referee">Referee assessment</h4>
      <p className="mt-1 text-sm text-ink-soft">{referee.rationale}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="label">Strongest bull point</dt>
          <dd className="text-sm text-ink-soft">{referee.strongest_bull_point}</dd>
        </div>
        <div>
          <dt className="label">Strongest bear point</dt>
          <dd className="text-sm text-ink-soft">{referee.strongest_bear_point}</dd>
        </div>
      </dl>
      {referee.unresolved_questions.length > 0 && (
        <div className="mt-3">
          <div className="label">Unresolved questions</div>
          <ul className="mt-1 list-inside list-disc text-sm text-ink-soft">
            {referee.unresolved_questions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}
      {referee.required_diligence.length > 0 && (
        <div className="mt-3">
          <div className="label">Required diligence</div>
          <ul className="mt-1 list-inside list-disc text-sm text-ink-soft">
            {referee.required_diligence.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Evidence that would change the call: {referee.evidence_that_would_change}
      </p>
    </div>
  );
}
