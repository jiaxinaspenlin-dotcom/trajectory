"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, ErrorState, Section, Spinner } from "@/components/ui";
import { ClaimsTable } from "@/components/ClaimsTable";
import { Claim, DiligenceQuestion, Opportunity } from "@/lib/types";
import { humanStatus } from "@/lib/format";

const STATUSES = ["open", "requested", "answered", "verified", "unresolved", "not_applicable"];

export default function DiligencePage() {
  const { id } = useParams<{ id: string }>();
  const opp = useFetch<Opportunity>(`/api/opportunities/${id}`);
  const diligence = useFetch<{ items: DiligenceQuestion[] }>(`/api/opportunities/${id}/diligence`);
  const claims = useFetch<{ items: Claim[] }>(opp.data?.company?.id ? `/api/claims?company_id=${opp.data.company.id}` : null);
  const contradictions = useFetch<{ items: any[] }>(`/api/contradictions${opp.data?.company?.id ? `?company_id=${opp.data.company.id}` : ""}`);

  const [genError, setGenError] = useState<string | null>(null);
  async function generate() {
    setGenError(null);
    try {
      await api.post(`/api/opportunities/${id}/diligence`);
      diligence.reload();
    } catch (e) {
      setGenError(
        e instanceof Error && (e.message.toLowerCase().includes("ai provider") || e.message.includes("OPENAI"))
          ? "AI is not configured — set OPENAI_API_KEY to generate new questions. Seeded demo questions remain available."
          : e instanceof Error ? e.message : "Generation failed."
      );
    }
  }
  async function setStatus(qid: number, status: string) {
    await api.put(`/api/diligence/${qid}/status`, { status });
    diligence.reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Diligence Workspace</h1>
          <p className="text-sm text-ink-muted">Open claims, verification, contradictions, and targeted questions.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/vc/opportunities/${id}`} className="btn-secondary">Back to Founder</Link>
          <button className="btn-primary" onClick={generate}>Generate Questions</button>
        </div>
      </div>

      {genError && <ErrorState message={genError} />}

      <Section title="Diligence Questions" subtitle="Track each to resolution">
        {diligence.loading ? <Spinner /> : diligence.error ? <ErrorState message={diligence.error} /> : (
          <div className="space-y-2">
            {diligence.data?.items.length ? diligence.data.items.map((q) => (
              <div key={q.id} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{q.question}</p>
                    <p className="text-xs text-ink-muted">{q.rationale}</p>
                    <div className="mt-1 flex gap-1">
                      <Badge tone="bg-neutral-wash text-neutral">{q.category}</Badge>
                      <Badge tone="bg-neutral-wash text-neutral">via {q.generated_by}</Badge>
                      {q.related_claim_ids.map((c) => <span key={c} className="chip bg-surface-sunken text-ink-muted font-mono">C{c}</span>)}
                    </div>
                  </div>
                  <select className="rounded-lg border border-line px-2 py-1 text-xs" value={q.status} onChange={(e) => setStatus(q.id, e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{humanStatus(s)}</option>)}
                  </select>
                </div>
              </div>
            )) : <p className="text-sm text-ink-muted">No questions yet. Generate them from the evidence.</p>}
          </div>
        )}
      </Section>

      <Section title="Claims & Trust Scores">
        {claims.data ? <ClaimsTable claims={claims.data.items} /> : <Spinner />}
      </Section>

      <Section title="Contradictions & Validation Failures">
        {contradictions.data?.items.length ? (
          <ul className="space-y-2">
            {contradictions.data.items.map((c) => (
              <li key={c.id} className="rounded-lg border border-negative/30 bg-negative-wash p-3 text-sm text-negative">
                <Badge tone="bg-white text-negative">{c.severity}</Badge> {c.description}
                <span className="ml-2 text-xs text-ink-muted">detected by {c.detected_by}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-muted">No contradictions detected.</p>}
        <p className="mt-3 text-xs text-ink-muted">
          A validation layer checks AI conclusions against real evidence IDs and rejects references to
          nonexistent evidence — so hallucinated citations never surface here.
        </p>
      </Section>
    </div>
  );
}
