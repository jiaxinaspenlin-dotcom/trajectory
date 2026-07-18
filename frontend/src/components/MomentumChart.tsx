"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Momentum } from "@/lib/types";
import { Badge } from "./ui";
import { trajectoryTone, humanStatus } from "@/lib/format";

export function MomentumChart({ momentum }: { momentum: Momentum }) {
  const data = momentum.series.map((s) => ({
    date: new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    score: s.score,
  }));

  return (
    <div data-tour="momentum" data-testid="momentum-chart">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="label">Current</div>
          <div className="text-2xl font-semibold text-ink">{momentum.current_score}</div>
        </div>
        <div>
          <div className="label">30-day</div>
          <div className={`text-lg font-semibold ${(momentum.change_30d ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
            {momentum.change_30d === null ? "—" : `${momentum.change_30d >= 0 ? "+" : ""}${momentum.change_30d}`}
          </div>
        </div>
        <div>
          <div className="label">90-day</div>
          <div className={`text-lg font-semibold ${(momentum.change_90d ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
            {momentum.change_90d === null ? "—" : `${momentum.change_90d >= 0 ? "+" : ""}${momentum.change_90d}`}
          </div>
        </div>
        <Badge tone={trajectoryTone(momentum.trajectory)}>{humanStatus(momentum.trajectory)}</Badge>
      </div>

      <div className="mt-3 h-40 w-full">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Line type="monotone" dataKey="score" stroke="#1e40af" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-ink-muted">Insufficient history to chart momentum.</p>
        )}
      </div>

      <p className="mt-2 text-sm text-ink-soft">{momentum.explanation}</p>

      {momentum.signal_trends.length > 0 && (
        <div className="mt-3">
          <div className="label mb-1">Signal-level trends</div>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {momentum.signal_trends.slice(0, 6).map((t) => (
              <li key={t.key} className="flex items-center justify-between rounded bg-surface-sunken px-2 py-1 text-xs">
                <span className="text-ink-soft">{t.label}</span>
                <span className={t.direction === "up" ? "text-positive" : t.direction === "down" ? "text-negative" : "text-ink-muted"}>
                  {t.direction === "up" ? "▲" : t.direction === "down" ? "▼" : "▬"} {t.change >= 0 ? "+" : ""}{t.change}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
