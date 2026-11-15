"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Debate } from "@/lib/types";
import { pct } from "@/lib/format";
import { BullCharacter, BearCharacter, RefereeCharacter, CharState } from "./Characters";
import { ArenaBackdrop } from "./stage";
import { EvidenceRef } from "../EvidenceRef";

type Role = "bull" | "bear" | "referee";

interface Turn {
  role: Role;
  text: string;
  evidence_ids?: number[];
  verdict?: boolean; // the closing recommendation turn
}

const ROLE_META: Record<Role, { name: string; sub: string; color: string; wash: string; border: string }> = {
  bull: { name: "Bull", sub: "Optimistic Case", color: "text-bull", wash: "bg-bull/10", border: "border-bull/30" },
  referee: { name: "Referee", sub: "Neutral Judge", color: "text-referee", wash: "bg-referee/10", border: "border-referee/30" },
  bear: { name: "Bear", sub: "Skeptical Case", color: "text-bear", wash: "bg-bear/10", border: "border-bear/30" },
};

// Turn the generated debate into an alternating, turn-taking conversation.
function buildTurns(debate: Debate): Turn[] {
  const bull = debate.arguments.find((a) => a.role === "bull");
  const bear = debate.arguments.find((a) => a.role === "bear");
  const ref = debate.referee;
  const turns: Turn[] = [];

  turns.push({
    role: "referee",
    text: ref?.speech_bubble || "Let's weigh the evidence on both sides — I judge the case, not the charisma.",
  });
  if (bull) turns.push({ role: "bull", text: bull.headline, evidence_ids: bull.referenced_evidence_ids });
  if (bear) turns.push({ role: "bear", text: bear.headline, evidence_ids: bear.referenced_evidence_ids });

  const n = Math.max(bull?.points.length ?? 0, bear?.points.length ?? 0);
  for (let i = 0; i < n; i++) {
    if (bull?.points[i]) turns.push({ role: "bull", text: bull.points[i].text, evidence_ids: bull.points[i].evidence_ids });
    if (bear?.points[i]) turns.push({ role: "bear", text: bear.points[i].text, evidence_ids: bear.points[i].evidence_ids });
  }

  if (ref) {
    if (ref.strongest_bull_point) turns.push({ role: "referee", text: `Strongest case to advance: ${ref.strongest_bull_point}` });
    if (ref.strongest_bear_point) turns.push({ role: "referee", text: `Biggest concern: ${ref.strongest_bear_point}` });
    if (ref.unresolved_questions?.length) turns.push({ role: "referee", text: `Still unresolved: ${ref.unresolved_questions.join("; ")}` });
    turns.push({
      role: "referee",
      verdict: true,
      text: `My recommendation: ${ref.recommended_action} (confidence ${pct(ref.confidence)}). ${ref.rationale}`,
    });
  }
  return turns;
}

function Avatar({ role, state, size }: { role: Role; state: CharState; size: number }) {
  const Comp = role === "bull" ? BullCharacter : role === "bear" ? BearCharacter : RefereeCharacter;
  return <Comp state={state} size={size} />;
}

function Refs({ ids }: { ids?: number[] }) {
  if (!ids || !ids.length) return null;
  return (
    <span className="ml-1 text-[11px] text-ink-muted">
      {ids.slice(0, 6).map((id) => (
        <EvidenceRef key={id} id={id} />
      ))}
    </span>
  );
}

type Phase = "intro" | "debate";

export function DebatePlayer({ debate, onClose }: { debate: Debate; onClose: () => void }) {
  const turns = buildTurns(debate);
  const [shown, setShown] = useState(1); // number of revealed turns
  const scrollRef = useRef<HTMLDivElement>(null);
  // "VS" intro that zooms out into the arena, then the chat starts.
  // Skipped entirely when the viewer prefers reduced motion.
  const [phase, setPhase] = useState<Phase>(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "debate"
      : "intro"
  );

  useEffect(() => {
    if (phase !== "intro") return;
    const t = setTimeout(() => setPhase("debate"), 2400);
    return () => clearTimeout(t);
  }, [phase]);

  const total = turns.length;
  const atEnd = shown >= total;
  const currentRole = turns[shown - 1]?.role;

  const next = useCallback(() => setShown((s) => Math.min(total, s + 1)), [total]);
  const back = useCallback(() => setShown((s) => Math.max(1, s - 1)), []);

  // keyboard: Esc closes; during the intro any other key skips it; in the
  // debate the arrows/space step through turns.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (phase === "intro") { e.preventDefault(); setPhase("debate"); return; }
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onClose, phase]);

  // keep the newest bubble in view
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [shown]);

  const stateFor = (role: Role): CharState => {
    if (role !== currentRole) return "idle";
    return role === "referee" ? "decision" : "speaking";
  };

  // ---- intro: "VS" that zooms out into the arena ----
  if (phase === "intro") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink"
        role="dialog"
        aria-modal="true"
        aria-label="Investment Arena — starting the debate"
        onClick={() => setPhase("debate")}
      >
        <div className="absolute inset-0 opacity-40"><ArenaBackdrop /></div>
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/40 to-ink/70" />

        <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 motion-safe:animate-[vsZoomOut_.5s_ease-in_1.9s_forwards] sm:gap-8">
          <div className="flex flex-col items-center motion-safe:animate-[vsBullIn_.55s_ease-out_both]">
            <BullCharacter state="speaking" size={150} />
            <span className="mt-2 text-lg font-extrabold text-bull drop-shadow">BULL</span>
          </div>
          <div className="text-6xl font-black italic tracking-tighter text-white drop-shadow-lg motion-safe:animate-[vsPop_.6s_ease-out_.35s_both] sm:text-8xl">
            VS
          </div>
          <div className="flex flex-col items-center motion-safe:animate-[vsBearIn_.55s_ease-out_both]">
            <BearCharacter state="speaking" size={150} />
            <span className="mt-2 text-lg font-extrabold text-bear drop-shadow">BEAR</span>
          </div>
        </div>

        <button
          className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-4 py-1.5 text-sm font-medium text-ink shadow-raised hover:bg-white"
          onClick={(e) => { e.stopPropagation(); setPhase("debate"); }}
        >
          Skip intro →
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface motion-safe:animate-[debateReveal_.4s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="Investment Arena — full debate"
    >
      {/* header */}
      <div className="relative flex items-center justify-between border-b border-line bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-ink sm:text-xl">Investment Arena — Full Debate</h2>
          <p className="text-xs text-ink-muted">v{debate.version} · {debate.generated_by} · click Next to hear each turn</p>
        </div>
        <button className="btn-secondary" onClick={onClose} aria-label="Close full debate">Close ✕</button>
      </div>

      {/* stage — the three characters, current speaker highlighted */}
      <div className="relative shrink-0 border-b border-line">
        <ArenaBackdrop />
        <div className="relative z-10 mx-auto grid max-w-3xl grid-cols-3 items-end gap-2 px-4 py-4">
          {(["bull", "referee", "bear"] as Role[]).map((role) => {
            const speaking = role === currentRole;
            const size = role === "referee" ? 96 : 80;
            return (
              <div key={role} className={`flex flex-col items-center transition-opacity ${speaking ? "opacity-100" : "opacity-55"}`}>
                <Avatar role={role} state={stateFor(role)} size={size} />
                <div className={`mt-1 text-center text-xs font-bold ${ROLE_META[role].color}`}>{ROLE_META[role].name}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-3">
          {turns.slice(0, shown).map((t, i) => {
            const meta = ROLE_META[t.role];
            const alignRight = t.role === "bear";
            const isNewest = i === shown - 1;
            return (
              <div
                key={i}
                className={`flex items-start gap-2 ${alignRight ? "flex-row-reverse" : "flex-row"} ${isNewest ? "motion-safe:animate-[arenaFadeIn_.25s_ease-out]" : ""}`}
              >
                <div className="mt-0.5 shrink-0">
                  <Avatar role={t.role} state="idle" size={40} />
                </div>
                <div className={`max-w-[80%] rounded-2xl border px-3 py-2 ${meta.wash} ${meta.border} ${alignRight ? "rounded-tr-sm" : "rounded-tl-sm"} ${t.verdict ? "ring-2 ring-brand/40" : ""}`}>
                  <div className={`text-xs font-bold ${meta.color}`}>{meta.name}<span className="ml-1 font-normal text-ink-muted">· {meta.sub}</span></div>
                  <p className="mt-0.5 text-sm text-ink-soft">{t.text}<Refs ids={t.evidence_ids} /></p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* footer controls */}
      <div className="shrink-0 border-t border-line bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button className="btn-secondary" onClick={back} disabled={shown <= 1}>← Back</button>
          <span className="text-xs text-ink-muted">Turn {shown} / {total}</span>
          {atEnd ? (
            <button className="btn-secondary" onClick={() => setShown(1)}>↺ Replay</button>
          ) : (
            <button className="btn-primary" onClick={next}>Next →</button>
          )}
        </div>
      </div>
    </div>
  );
}
