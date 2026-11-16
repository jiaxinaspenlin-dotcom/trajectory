"use client";

import { useState } from "react";
import { ScoreComponent } from "@/lib/types";
import { InfoTip } from "./InfoTip";
import { humanStatus } from "@/lib/format";

// Plain-language explanations of each deterministic Founder Score component,
// keyed by the backend component key (app/scoring/founder_score.py).
const COMPONENT_INFO: Record<string, string> = {
  execution_consistency:
    "How steadily the founder ships over time — sustained commit activity, maintained repositories, and following through on launches and hackathons rather than starting and abandoning.",
  technical_evidence:
    "Concrete proof of technical ability from public work — repositories, the languages used, tagged releases, and technical write-ups.",
  product_progress:
    "Signs of a real product moving forward — launches, iterations on earlier versions, working demos, and releases.",
  external_validation:
    "Recognition from outside the founder themselves — outside contributors to their repos, press mentions, accelerators, and awards.",
  traction:
    "Evidence of market pull — user growth, revenue, pilots, and named customers.",
  leadership_collaboration:
    "Working well with and attracting others — outside contributors, team growth, resolving issues, and visible collaboration.",
  learning_velocity:
    "How quickly the founder learns and adapts — product iterations, releases, moving into new domains, and demonstrable skill growth.",
  domain_experience:
    "Relevant background in the space — prior domain experience, work history, and past startups.",
  evidence_reliability:
    "How trustworthy the underlying evidence is — the mix of independent sources and verified versus unverified items feeding the score.",
};

export function FounderScoreBreakdown({ components }: { components: ScoreComponent[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...components].sort((a, b) => b.contribution - a.contribution);
  return (
    <div className="mt-3">
      <button className="btn-ghost text-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Hide" : "Show"} Component Breakdown ({components.length})
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
                  <td className="py-1.5 font-medium text-ink-soft">
                    <span className="inline-flex items-center whitespace-nowrap">
                      {humanStatus(c.key)}
                      {COMPONENT_INFO[c.key] && <InfoTip text={COMPONENT_INFO[c.key]} />}
                    </span>
                  </td>
                  <td>{Math.round(c.weight * 100)}%</td>
                  <td>{Math.round(c.value)}</td>
                  <td>{c.evidence_count}</td>
                  <td>{Math.round(c.confidence * 100)}%</td>
                  <td>{c.missingness >= 0.99 ? <span className="text-caution">Missing</span> : `${Math.round(c.missingness * 100)}%`}</td>
                  <td className="font-semibold text-ink">{c.contribution.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-muted">
            The numeric baseline is computed deterministically in Python; the language model never invents the score.
          </p>
        </div>
      )}
    </div>
  );
}
