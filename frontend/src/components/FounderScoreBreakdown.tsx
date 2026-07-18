"use client";

import { useState } from "react";
import { ScoreComponent } from "@/lib/types";

export function FounderScoreBreakdown({ components }: { components: ScoreComponent[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...components].sort((a, b) => b.contribution - a.contribution);
  return (
    <div className="mt-3">
      <button className="btn-ghost text-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Hide" : "Show"} component breakdown ({components.length})
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="py-1">Component</th>
                <th>Weight</th>
                <th>Value</th>
                <th>Evidence</th>
                <th>Conf.</th>
                <th>Missing</th>
                <th>Contribution</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.key} className="border-t border-line">
                  <td className="py-1.5 font-medium text-ink-soft">{c.name}</td>
                  <td>{Math.round(c.weight * 100)}%</td>
                  <td>{Math.round(c.value)}</td>
                  <td>{c.evidence_count}</td>
                  <td>{Math.round(c.confidence * 100)}%</td>
                  <td>{c.missingness >= 0.99 ? <span className="text-caution">missing</span> : `${Math.round(c.missingness * 100)}%`}</td>
                  <td className="font-semibold text-ink">{c.contribution.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ink-muted">
            The numeric baseline is computed deterministically in Python; the language model never invents the score.
          </p>
        </div>
      )}
    </div>
  );
}
