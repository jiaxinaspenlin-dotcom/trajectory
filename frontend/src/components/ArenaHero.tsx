"use client";

import { BearCharacter, BullCharacter, RefereeCharacter } from "./arena/Characters";
import { ArenaBackdrop, Emblem, Flourish, Pedestal, RefereeBadge } from "./arena/stage";

// The dashboard's Investment Arena hero — the coded stadium illustration with
// static role captions. The Referee anchors the guided tour (data-tour="arena").

function Column({
  children,
  name,
  role,
  color,
  tour,
}: {
  children: React.ReactNode;
  name: string;
  role: string;
  color: string;
  tour?: boolean;
}) {
  return (
    <div className="flex flex-col items-center" {...(tour ? { "data-tour": "arena" } : {})}>
      <div className="relative">{children}</div>
      <Pedestal />
      <div className="mt-1 text-center">
        <div className={`text-sm font-bold ${color}`}>{name}</div>
        <div className="text-xs text-ink-muted">{role}</div>
      </div>
    </div>
  );
}

export function ArenaHero() {
  return (
    <section className="card mx-auto w-full max-w-[1100px] overflow-hidden" data-testid="arena-hero" aria-label="Investment Arena">
      <div className="relative">
        <ArenaBackdrop />
        <div className="relative z-10 px-4 pb-6 pt-6">
          <div className="flex justify-center">
            <Emblem />
          </div>

          <div className="mt-1 flex items-center justify-center gap-3">
            <Flourish side="left" />
            <h2 className="text-center text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Investment Arena
            </h2>
            <Flourish side="right" />
          </div>
          <p className="mt-1 text-center text-sm font-medium text-ink-muted sm:text-base">
            Different perspectives. Better decisions.
          </p>

          <div className="mx-auto mt-5 grid max-w-2xl grid-cols-3 items-end gap-1 sm:gap-3">
            <Column name="Bull" role="Optimistic Case" color="text-bull">
              <BullCharacter size={96} />
            </Column>

            <Column name="Referee" role="Neutral Judge" color="text-referee" tour>
              <RefereeBadge />
              <RefereeCharacter size={118} />
            </Column>

            <Column name="Bear" role="Skeptical Case" color="text-bear">
              <BearCharacter size={96} />
            </Column>
          </div>
        </div>
      </div>

      <div className="border-t border-line px-6 py-5">
        <p className="mx-auto max-w-3xl text-center text-sm leading-relaxed text-ink-soft">
          On every founder, a <strong className="text-bull">Bull</strong> makes the strongest
          evidence-backed case to advance, a neutral <strong className="text-referee">Referee</strong>{" "}
          weighs the evidence and its independence, not the rhetoric, and a{" "}
          <strong className="text-bear">Bear</strong> makes the strongest case for caution. Trajectory
          surfaces all three and recommends your next step. You always make the final call.
        </p>
      </div>
    </section>
  );
}
