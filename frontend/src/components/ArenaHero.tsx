"use client";

import { BearCharacter, BullCharacter, RefereeCharacter } from "./arena/Characters";

// The signature Investment Arena block at the top of the investor workspace.
// Illustrative (Bull · Referee · Bear); the Referee also anchors the guided
// tour, whose first speech bubble pops up right next to him.
export function ArenaHero() {
  return (
    <section
      className="card overflow-hidden"
      data-testid="arena-hero"
      aria-label="Investment Arena"
    >
      <div className="grid items-center gap-6 p-6 md:grid-cols-[1.1fr_auto]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">The Investment Arena</h2>
            <span className="chip bg-brand-wash text-brand">How Trajectory Decides</span>
          </div>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            On every founder, a <strong className="text-bull">Bull</strong> makes the strongest
            evidence-backed case to advance, a <strong className="text-bear">Bear</strong> makes the
            strongest case for caution, and a neutral <strong className="text-referee">Referee</strong>{" "}
            weighs the <em>evidence and its independence</em> — not the rhetoric — to recommend your
            next step. You always make the final call.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-muted">
            <span><span className="font-semibold text-bull">Bull</span> · case to advance</span>
            <span><span className="font-semibold text-referee">Referee</span> · weighs evidence, recommends</span>
            <span><span className="font-semibold text-bear">Bear</span> · case for caution</span>
          </div>
        </div>

        <div className="flex items-end justify-center gap-4 sm:gap-6">
          <figure className="text-center" title="Bull — the case to advance">
            <BullCharacter size={84} />
            <figcaption className="mt-1 text-xs font-semibold text-bull">Bull</figcaption>
          </figure>

          {/* Referee anchors the guided tour (data-tour="arena"). */}
          <figure className="text-center" data-tour="arena" title="Referee — weighs the evidence and recommends a next step">
            <RefereeCharacter size={92} />
            <figcaption className="mt-1 text-xs font-semibold text-referee">Referee</figcaption>
          </figure>

          <figure className="text-center" title="Bear — the case for caution">
            <BearCharacter size={84} />
            <figcaption className="mt-1 text-xs font-semibold text-bear">Bear</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
