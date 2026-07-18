"use client";

import { BearCharacter, BullCharacter, RefereeCharacter } from "./arena/Characters";

// Original coded illustration of the Investment Arena: a stadium hero with an
// emblem, title flourishes, a tiered crowd, flags, a podium, and the three
// characters (Bull · Referee · Bear) with role captions. The Referee also
// anchors the guided tour (data-tour="arena"). The platform description sits
// underneath the illustration.

/** Deterministic crowd row along an arc (no random -> SSR-stable). */
function crowd(cx: number, cy: number, rx: number, ry: number, n: number, a0: number, a1: number) {
  const pts: { x: number; y: number }[] = [];
  for (let k = 0; k < n; k++) {
    const t = a0 + (a1 - a0) * (k / (n - 1));
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return pts;
}

function ArenaBackdrop() {
  // shallow arcs near the bottom read as tiered stands behind the characters.
  const rowsBack = crowd(500, 360, 560, 60, 42, Math.PI * 1.03, Math.PI * 1.97);
  const rowsFront = crowd(500, 388, 500, 52, 34, Math.PI * 1.04, Math.PI * 1.96);
  return (
    // bottom-anchored cover: the stands/field always sit behind the characters,
    // whatever the hero's width; the top (rays/glow) is decorative if cropped.
    <svg
      viewBox="0 0 1000 440"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="arenaSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8fbff" />
          <stop offset="1" stopColor="#edf1f8" />
        </linearGradient>
        <radialGradient id="arenaGlow" cx="50%" cy="40%" r="62%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1000" height="440" fill="url(#arenaSky)" />

      {/* light rays fanning from the top center */}
      <g opacity="0.45">
        {Array.from({ length: 11 }).map((_, k) => {
          const a = (-90 + (k - 5) * 12) * (Math.PI / 180);
          const x = 500 + Math.cos(a) * 950;
          const y = 120 + Math.sin(a) * 950;
          return (
            <polygon key={k} points={`500,120 ${x - 24},${y} ${x + 24},${y}`} fill="#dbe4f0" opacity={k % 2 ? 0.3 : 0.5} />
          );
        })}
      </g>
      <ellipse cx="500" cy="150" rx="540" ry="300" fill="url(#arenaGlow)" />

      {/* flags */}
      {[
        { x: 130, y: 150, c: "#93c5b5" },
        { x: 866, y: 150, c: "#e6c9a2" },
      ].map((f, k) => (
        <g key={k}>
          <rect x={f.x} y={f.y} width="4" height="150" rx="2" fill="#cbd5e1" />
          <path d={`M${f.x + 4} ${f.y} h58 l-14 15 l14 15 h-58 Z`} fill={f.c} opacity="0.7" />
        </g>
      ))}

      {/* sparkles */}
      {[[150, 250], [210, 330], [840, 250], [800, 340], [690, 175], [320, 185]].map(([x, y], k) => (
        <path
          key={k}
          d={`M${x} ${y - 8} L${x + 2.4} ${y - 2.4} L${x + 8} ${y} L${x + 2.4} ${y + 2.4} L${x} ${y + 8} L${x - 2.4} ${y + 2.4} L${x - 8} ${y} L${x - 2.4} ${y - 2.4} Z`}
          fill="#c7d2e6"
          className="motion-safe:animate-pulse"
        />
      ))}

      {/* tiered stands near the bottom */}
      <g>
        {rowsBack.map((p, k) => (
          <g key={`b${k}`} transform={`translate(${p.x} ${p.y})`} fill="#c3cddd" opacity="0.5">
            <circle cx="0" cy="0" r="5" />
            <path d="M-6 13 A6 6 0 0 1 6 13 Z" />
          </g>
        ))}
        {rowsFront.map((p, k) => (
          <g key={`f${k}`} transform={`translate(${p.x} ${p.y})`} fill="#aab6ca" opacity="0.6">
            <circle cx="0" cy="0" r="6" />
            <path d="M-7 15 A7 7 0 0 1 7 15 Z" />
          </g>
        ))}
      </g>

      {/* arena field / stage floor */}
      <ellipse cx="500" cy="438" rx="660" ry="94" fill="#ffffff" opacity="0.92" />
      <ellipse cx="500" cy="438" rx="660" ry="94" fill="none" stroke="#e2e8f0" strokeWidth="2" />
    </svg>
  );
}

function Emblem() {
  return (
    <svg width="66" height="60" viewBox="0 0 66 60" aria-hidden>
      {/* laurel wreath */}
      <g stroke="#c3d0e2" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M24 8 C10 12 8 30 20 46" />
        <path d="M42 8 C56 12 58 30 46 46" />
      </g>
      <g fill="#cbd7e6">
        {[12, 20, 28, 36].map((y, k) => (
          <g key={k}>
            <ellipse cx={20 - k} cy={y} rx="4" ry="2.2" transform={`rotate(-35 ${20 - k} ${y})`} />
            <ellipse cx={46 + k} cy={y} rx="4" ry="2.2" transform={`rotate(35 ${46 + k} ${y})`} />
          </g>
        ))}
      </g>
      {/* column */}
      <g fill="#9fb2cc">
        <rect x="26" y="12" width="14" height="4" rx="1.5" />
        <rect x="27.5" y="16" width="2.6" height="24" rx="1" />
        <rect x="31.7" y="16" width="2.6" height="24" rx="1" />
        <rect x="35.9" y="16" width="2.6" height="24" rx="1" />
        <rect x="25" y="40" width="16" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

function Flourish({ side }: { side: "left" | "right" }) {
  const flip = side === "right";
  return (
    <svg width="90" height="16" viewBox="0 0 90 16" aria-hidden className="hidden text-line sm:block" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <line x1="0" y1="8" x2="60" y2="8" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
      <path d="M74 8 l6 -6 l6 6 l-6 6 Z" fill="#cbd5e1" />
    </svg>
  );
}

function Pedestal({ w = 150 }: { w?: number }) {
  return (
    <svg width={w} height="34" viewBox="0 0 150 34" aria-hidden className="mx-auto -mt-2">
      <ellipse cx="75" cy="24" rx="66" ry="9" fill="#0f172a" opacity="0.06" />
      <ellipse cx="75" cy="18" rx="60" ry="10" fill="#ffffff" />
      <ellipse cx="75" cy="18" rx="60" ry="10" fill="none" stroke="#e2e8f0" strokeWidth="1.5" />
    </svg>
  );
}

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
    <section className="card overflow-hidden" data-testid="arena-hero" aria-label="Investment Arena">
      {/* Illustration */}
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

          {/* podium + characters */}
          <div className="mx-auto mt-5 grid max-w-2xl grid-cols-3 items-end gap-1 sm:gap-3">
            <Column name="Bull" role="Optimistic Case" color="text-bull">
              <BullCharacter size={96} />
            </Column>

            <Column name="Referee" role="Neutral Judge" color="text-referee" tour>
              {/* neutral "=" badge above the Referee's head */}
              <div className="absolute -top-2 left-1/2 z-10 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full border-2 border-referee bg-brand-wash shadow-sm">
                <span className="text-sm font-bold leading-none text-referee">=</span>
              </div>
              <RefereeCharacter size={118} />
            </Column>

            <Column name="Bear" role="Skeptical Case" color="text-bear">
              <BearCharacter size={96} />
            </Column>
          </div>
        </div>
      </div>

      {/* description underneath the illustration */}
      <div className="border-t border-line px-6 py-5">
        <p className="mx-auto max-w-3xl text-center text-sm leading-relaxed text-ink-soft">
          On every founder, a <strong className="text-bull">Bull</strong> makes the strongest
          evidence-backed case to advance, a neutral <strong className="text-referee">Referee</strong>{" "}
          weighs the evidence and its independence — not the rhetoric — and a{" "}
          <strong className="text-bear">Bear</strong> makes the strongest case for caution. Trajectory
          surfaces all three and recommends your next step. You always make the final call.
        </p>
      </div>
    </section>
  );
}
