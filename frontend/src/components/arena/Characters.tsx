// Vector characters for the Investment Arena, drawn with inline SVG.
// Each accepts a `state` that subtly changes pose/expression.

export type CharState = "idle" | "speaking" | "selected" | "pointing" | "decision";

const wrap = (state: CharState, selected: string) =>
  `transition-transform duration-200 ${state === "selected" ? selected : ""} ${
    state === "speaking" ? "motion-safe:-translate-y-0.5" : ""
  }`;

export function BullCharacter({ state = "idle", size = 96 }: { state?: CharState; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={wrap(state, "scale-105")} aria-hidden focusable="false">
      <defs>
        <linearGradient id="bullBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      {/* ground shadow */}
      <ellipse cx="60" cy="108" rx="30" ry="5" fill="#0f172a" opacity="0.08" />
      {/* horns */}
      <path d="M32 46 C22 34 24 24 30 22 C34 30 40 36 44 42 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
      <path d="M88 46 C98 34 96 24 90 22 C86 30 80 36 76 42 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
      {/* head */}
      <path d="M60 30 C82 30 92 46 92 64 C92 86 78 98 60 98 C42 98 28 86 28 64 C28 46 38 30 60 30 Z" fill="url(#bullBody)" />
      {/* snout */}
      <ellipse cx="60" cy="78" rx="20" ry="15" fill="#34d399" />
      <ellipse cx="52" cy="80" rx="2.6" ry="3.4" fill="#065f46" />
      <ellipse cx="68" cy="80" rx="2.6" ry="3.4" fill="#065f46" />
      {/* eyes — confident, looking up */}
      <circle cx="49" cy="58" r="6" fill="#ffffff" />
      <circle cx="71" cy="58" r="6" fill="#ffffff" />
      <circle cx={state === "pointing" ? 51 : 50} cy={state === "speaking" ? 55 : 56} r="3" fill="#0f172a" />
      <circle cx={state === "pointing" ? 73 : 72} cy={state === "speaking" ? 55 : 56} r="3" fill="#0f172a" />
      {/* confident brow */}
      <path d="M43 50 Q49 47 55 50" stroke="#065f46" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M65 50 Q71 47 77 50" stroke="#065f46" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* up arrow badge = opportunity */}
      <circle cx="94" cy="30" r="13" fill="#ecfdf5" stroke="#047857" strokeWidth="2" />
      <path d="M94 24 L99 32 L95 32 L95 37 L93 37 L93 32 L89 32 Z" fill="#047857" />
    </svg>
  );
}

export function BearCharacter({ state = "idle", size = 96 }: { state?: CharState; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={wrap(state, "scale-105")} aria-hidden focusable="false">
      <defs>
        <linearGradient id="bearBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="108" rx="30" ry="5" fill="#0f172a" opacity="0.08" />
      {/* ears */}
      <circle cx="36" cy="34" r="12" fill="url(#bearBody)" />
      <circle cx="84" cy="34" r="12" fill="url(#bearBody)" />
      <circle cx="36" cy="34" r="6" fill="#fed7aa" />
      <circle cx="84" cy="34" r="6" fill="#fed7aa" />
      {/* head */}
      <path d="M60 26 C84 26 94 44 94 64 C94 88 80 98 60 98 C40 98 26 88 26 64 C26 44 36 26 60 26 Z" fill="url(#bearBody)" />
      {/* muzzle */}
      <ellipse cx="60" cy="80" rx="18" ry="13" fill="#fed7aa" />
      <ellipse cx="60" cy="74" rx="4" ry="3" fill="#7c2d12" />
      {/* analytical glasses */}
      <circle cx="49" cy="60" r="9" fill="#ffffff" stroke="#7c2d12" strokeWidth="2" />
      <circle cx="71" cy="60" r="9" fill="#ffffff" stroke="#7c2d12" strokeWidth="2" />
      <path d="M58 60 H62" stroke="#7c2d12" strokeWidth="2" />
      {/* skeptical eyes — looking down/side */}
      <circle cx={state === "pointing" ? 47 : 49} cy="62" r="3" fill="#0f172a" />
      <circle cx={state === "pointing" ? 69 : 71} cy="62" r="3" fill="#0f172a" />
      {/* skeptical brow (angled) */}
      <path d="M41 50 L57 54" stroke="#7c2d12" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M79 50 L63 54" stroke="#7c2d12" strokeWidth="2.5" strokeLinecap="round" />
      {/* down arrow badge = risk */}
      <circle cx="94" cy="30" r="13" fill="#fffbeb" stroke="#b45309" strokeWidth="2" />
      <path d="M94 37 L89 29 L93 29 L93 24 L95 24 L95 29 L99 29 Z" fill="#b45309" />
    </svg>
  );
}

export function RefereeCharacter({ state = "idle", size = 96 }: { state?: CharState; size?: number }) {
  const pointing = state === "pointing";
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={wrap(state, "scale-105")} aria-hidden focusable="false">
      <defs>
        <linearGradient id="refShirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e40af" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="112" rx="28" ry="5" fill="#0f172a" opacity="0.08" />
      {/* body / referee stripes shirt */}
      <path d="M34 118 C34 92 44 82 60 82 C76 82 86 92 86 118 Z" fill="url(#refShirt)" />
      <path d="M50 84 V118 M60 82 V118 M70 84 V118" stroke="#ffffff" strokeWidth="3" opacity="0.85" />
      {/* neck */}
      <rect x="54" y="70" width="12" height="14" rx="4" fill="#e8b98f" />
      {/* head */}
      <circle cx="60" cy="54" r="22" fill="#f1c9a5" />
      {/* hair */}
      <path d="M39 50 C40 34 52 28 60 28 C68 28 80 34 81 50 C74 42 66 40 60 40 C54 40 46 42 39 50 Z" fill="#5b3a29" />
      {/* eyes — neutral, forward (or toward metric when pointing) */}
      <circle cx={pointing ? 54 : 53} cy="54" r="2.6" fill="#0f172a" />
      <circle cx={pointing ? 68 : 67} cy="54" r="2.6" fill="#0f172a" />
      <path d="M48 47 Q53 45 57 47" stroke="#5b3a29" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M63 47 Q67 45 72 47" stroke="#5b3a29" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* calm mouth */}
      <path d="M54 64 Q60 68 66 64" stroke="#a15b3a" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* whistle */}
      <path d="M60 70 L74 74" stroke="#94a3b8" strokeWidth="2" />
      <circle cx="77" cy="75" r="5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
      {/* decision card OR pointing arm */}
      {state === "decision" ? (
        <g>
          <rect x="80" y="60" width="30" height="22" rx="3" fill="#ffffff" stroke="#1e40af" strokeWidth="2" transform="rotate(8 95 71)" />
          <path d="M86 70 l4 4 l8 -9" stroke="#047857" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="rotate(8 95 71)" />
        </g>
      ) : pointing ? (
        <g>
          <path d="M84 92 L108 70" stroke="#e8b98f" strokeWidth="8" strokeLinecap="round" />
          <path d="M104 66 l8 2 l-4 7 Z" fill="#1e40af" />
        </g>
      ) : null}
    </svg>
  );
}
