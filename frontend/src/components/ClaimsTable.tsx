"use client";

import { Claim } from "@/lib/types";
import { Badge } from "./ui";
import { humanStatus, verificationTone } from "@/lib/format";
import { EvidenceRef } from "./EvidenceRef";

function trustTone(score: number): string {
  if (score >= 70) return "text-positive";
  if (score >= 45) return "text-caution";
  return "text-negative";
}

// One claim per row: the claim itself first, then how far to trust it and the
// evidence it rests on. Stacks on any width, so nothing scrolls sideways.
export function ClaimsTable({ claims }: { claims: Claim[] }) {
  if (!claims.length) {
    return <p className="text-sm text-ink-muted">No claims recorded yet.</p>;
  }
  return (
    <ol className="divide-y divide-line" data-testid="claims-table" aria-label="Claims">
      {claims.map((c, i) => (
        <li key={c.id} className="animate-rise grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]" style={{ "--i": i } as React.CSSProperties}>
          <div className="min-w-0">
            <p className="text-[15px] leading-6 text-ink" data-content>{c.text}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
              <span>{humanStatus(c.category)}</span>
              <span aria-hidden>·</span>
              <span>{c.provenance === "independent" ? "Independent" : "Founder-Reported"}</span>
              <span aria-hidden>·</span>
              <span className="text-xs">
                {c.supporting_evidence_ids.length
                  ? c.supporting_evidence_ids.map((id) => <EvidenceRef key={id} id={id} />)
                  : "No Evidence Cited"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
            <Badge tone={verificationTone(c.verification_status)}>{humanStatus(c.verification_status)}</Badge>
            <span className="text-[13px] text-ink-muted">Trust <span className={`num font-semibold ${trustTone(c.trust_score)}`}>{Math.round(c.trust_score)}</span></span>
          </div>
        </li>
      ))}
    </ol>
  );
}
