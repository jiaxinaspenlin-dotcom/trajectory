"use client";

// A visible-but-subtle stadium bowl for the landing hero background — tiered
// crowd, an arena field, flags, light rays and sparkles. No characters. Sized
// to fill a wide landscape hero (unlike the compact ArenaBackdrop used in cards).

function ring(cx: number, cy: number, rx: number, ry: number, n: number, phase = 0) {
  const pts: { x: number; y: number }[] = [];
  for (let k = 0; k < n; k++) {
    const t = phase + (2 * Math.PI * k) / n;
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return pts;
}

export function LandingBackdrop() {
  const cx = 800;
  const cy = 780;
  const tiers = [
    { rx: 840, ry: 330 },
    { rx: 715, ry: 278 },
    { rx: 595, ry: 228 },
    { rx: 480, ry: 180 },
  ];
  return (
    <svg
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="lbSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7fbff" />
          <stop offset="1" stopColor="#e8eef7" />
        </linearGradient>
        <radialGradient id="lbGlow" cx="50%" cy="14%" r="62%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lbField" cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor="#eef8f1" />
          <stop offset="1" stopColor="#e3eee7" />
        </radialGradient>
      </defs>

      <rect width="1600" height="1000" fill="url(#lbSky)" />

      {/* light rays fanning from the top center */}
      <g opacity="0.55">
        {Array.from({ length: 13 }).map((_, k) => {
          const a = (-90 + (k - 6) * 11) * (Math.PI / 180);
          const x = 800 + Math.cos(a) * 1400;
          const y = 60 + Math.sin(a) * 1400;
          return (
            <polygon key={k} points={`800,60 ${x - 30},${y} ${x + 30},${y}`} fill="#d6e1f0" opacity={k % 2 ? 0.4 : 0.6} />
          );
        })}
      </g>
      <ellipse cx="800" cy="120" rx="900" ry="440" fill="url(#lbGlow)" />

      {/* flags */}
      {[
        { x: 250, y: 210, c: "#8fc7b3" },
        { x: 1346, y: 210, c: "#e6c9a2" },
      ].map((f, k) => (
        <g key={k} opacity="0.8">
          <rect x={f.x} y={f.y} width="6" height="200" rx="3" fill="#c6d2e2" />
          <path d={`M${f.x + 6} ${f.y} h84 l-20 22 l20 22 h-84 Z`} fill={f.c} />
        </g>
      ))}

      {/* sparkles */}
      {[[200, 360], [320, 480], [1360, 420], [1280, 560], [520, 280], [1120, 300]].map(([x, y], k) => (
        <path
          key={k}
          d={`M${x} ${y - 12} L${x + 3.4} ${y - 3.4} L${x + 12} ${y} L${x + 3.4} ${y + 3.4} L${x} ${y + 12} L${x - 3.4} ${y + 3.4} L${x - 12} ${y} L${x - 3.4} ${y - 3.4} Z`}
          fill="#c7d2e6"
          className="motion-safe:animate-pulse"
        />
      ))}

      {/* stadium bowl — tiered stands */}
      {tiers.map((t, i) => (
        <ellipse
          key={`t${i}`}
          cx={cx}
          cy={cy}
          rx={t.rx}
          ry={t.ry}
          fill="none"
          stroke={i % 2 ? "#cbd7e8" : "#dae4f1"}
          strokeWidth="30"
          opacity="0.7"
        />
      ))}

      {/* crowd along each tier */}
      {tiers.map((t, i) =>
        ring(cx, cy, t.rx, t.ry, 70 - i * 10, i * 0.22).map((p, k) => (
          <circle key={`c${i}-${k}`} cx={p.x} cy={p.y} r="5" fill={i % 2 ? "#aeb9cf" : "#bcc8dc"} opacity="0.8" />
        ))
      )}

      {/* arena field */}
      <ellipse cx={cx} cy={cy + 16} rx="425" ry="158" fill="url(#lbField)" stroke="#d6e2ee" strokeWidth="3" />
      <ellipse cx={cx} cy={cy + 16} rx="128" ry="48" fill="none" stroke="#cfe0d6" strokeWidth="3" />
      <line x1={cx} y1={cy - 138} x2={cx} y2={cy + 170} stroke="#cfe0d6" strokeWidth="3" opacity="0.7" />
    </svg>
  );
}
