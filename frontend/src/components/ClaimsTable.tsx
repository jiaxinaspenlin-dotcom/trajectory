"use client";

import { Claim } from "@/lib/types";
import { Badge } from "./ui";
import { humanStatus, verificationTone } from "@/lib/format";

function trustTone(score: number): string {
  if (score >= 70) return "text-positive";
  if (score >= 45) return "text-caution";
  return "text-negative";
}

export function ClaimsTable({ claims }: { claims: Claim[] }) {
  if (!claims.length) {
    return <p className="text-sm text-ink-muted">No claims recorded yet.</p>;
  }
  return (
    <div className="relative overflow-x-auto" data-testid="claims-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th className="py-1 pr-2">Claim</th>
            <th className="pr-2">Category</th>
            <th className="pr-2">Source</th>
            <th className="pr-2">Status</th>
            <th className="pr-2">Trust</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.id} className="border-t border-line align-top">
              <td className="py-2 pr-2 text-ink-soft">{c.text}</td>
              <td className="pr-2 text-ink-muted">{c.category}</td>
              <td className="pr-2 text-xs text-ink-muted">
                {c.provenance === "independent" ? "Independent" : "Founder-reported"}
              </td>
              <td className="pr-2"><Badge tone={verificationTone(c.verification_status)}>{humanStatus(c.verification_status)}</Badge></td>
              <td className={`pr-2 font-semibold ${trustTone(c.trust_score)}`}>{Math.round(c.trust_score)}</td>
              <td className="text-[11px] text-ink-muted">
                {c.supporting_evidence_ids.length
                  ? c.supporting_evidence_ids.map((id) => <span key={id} className="mr-1 rounded bg-surface-sunken px-1 font-mono">E{id}</span>)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
