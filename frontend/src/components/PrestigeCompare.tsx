"use client";

import { useState } from "react";
import { RankingEntry } from "@/lib/types";
import { Badge } from "./ui";

export function PrestigeCompare({ entries }: { entries: RankingEntry[] }) {
  const [sideBySide, setSideBySide] = useState(true);
  const std = [...entries].sort((a, b) => a.standard_rank - b.standard_rank);
  const pf = [...entries].sort((a, b) => a.prestige_free_rank - b.prestige_free_rank);

  return (
    <div data-tour="prestige" data-testid="prestige-compare">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          A bias &amp; sensitivity audit — the prestige-free view masks university, employer, accelerator,
          investor-network and geography-as-proxy signals. It is not automatically “better”.
        </p>
        <button className="btn-secondary shrink-0 text-xs" onClick={() => setSideBySide((v) => !v)} data-testid="prestige-toggle">
          {sideBySide ? "Show delta view" : "Side-by-side"}
        </button>
      </div>

      {sideBySide ? (
        <div className="grid gap-4 md:grid-cols-2">
          <RankColumn title="Standard ranking" list={std} rankKey="standard_rank" scoreKey="standard_score" />
          <RankColumn title="Prestige-free ranking" list={pf} rankKey="prestige_free_rank" scoreKey="prestige_free_score" />
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="py-1">Founder</th>
              <th>Std</th>
              <th>Prestige-free</th>
              <th>Δ</th>
              <th>Influential prestige</th>
            </tr>
          </thead>
          <tbody>
            {std.map((e) => (
              <tr key={e.candidate_id} className="border-t border-line">
                <td className="py-2 font-medium text-ink">{e.name}</td>
                <td>#{e.standard_rank}</td>
                <td>#{e.prestige_free_rank}</td>
                <td>
                  {e.rank_delta === 0 ? (
                    <span className="text-ink-muted">0</span>
                  ) : (
                    <span className={e.rank_delta > 0 ? "text-positive" : "text-negative"}>
                      {e.rank_delta > 0 ? `↑${e.rank_delta}` : `↓${Math.abs(e.rank_delta)}`}
                    </span>
                  )}
                  {e.substantial_change && <Badge tone="bg-caution-wash text-caution">substantial</Badge>}
                </td>
                <td className="text-xs text-ink-muted">
                  {e.influential_prestige_variables.slice(0, 2).map((v) => v.label).join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {entries.some((e) => e.substantial_change) && (
        <div className="mt-3 rounded-lg border border-caution/30 bg-caution-wash p-3 text-xs text-caution" role="alert">
          Some rankings change substantially once prestige signals are masked — review these for potential bias.
        </div>
      )}
    </div>
  );
}

function RankColumn({ title, list, rankKey, scoreKey }: { title: string; list: RankingEntry[]; rankKey: "standard_rank" | "prestige_free_rank"; scoreKey: "standard_score" | "prestige_free_score" }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-ink">{title}</h4>
      <ol className="space-y-1">
        {list.map((e) => (
          <li key={e.candidate_id} className="flex items-center justify-between rounded bg-surface-sunken px-2 py-1.5 text-sm">
            <span className="text-ink-soft"><span className="mr-2 font-mono text-ink-muted">#{e[rankKey]}</span>{e.name}</span>
            <span className="font-medium text-ink">{Math.round(e[scoreKey])}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
