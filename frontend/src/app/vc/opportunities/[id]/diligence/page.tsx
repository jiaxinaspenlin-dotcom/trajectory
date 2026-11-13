"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, ErrorState, PageHeader, Section, Spinner } from "@/components/ui";
import { ClaimsTable } from "@/components/ClaimsTable";
import { Claim, DiligenceQuestion, Opportunity } from "@/lib/types";
import { humanStatus } from "@/lib/format";

const STATUSES = ["open", "requested", "answered", "verified", "unresolved", "not_applicable"];

export default function DiligencePage() {
  const { id } = useParams<{ id: string }>();
  const opp = useFetch<Opportunity>(`/api/opportunities/${id}`);
  const diligence = useFetch<{ items: DiligenceQuestion[] }>(`/api/opportunities/${id}/diligence`);
  const scope = opp.data?.company?.id
    ? `company_id=${opp.data.company.id}`
    : opp.data?.founder?.id
    ? `founder_id=${opp.data.founder.id}`
    : null;
  const claims = useFetch<{ items: Claim[] }>(scope ? `/api/claims?${scope}` : null);
  const contradictions = useFetch<{ items: any[] }>(scope ? `/api/contradictions?${scope}` : null);

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
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
        <Link href={`/vc/opportunities/${id}`} className="hover:text-brand">{opp.data?.company?.name || opp.data?.founder?.full_name || "Opportunity"}</Link>
        <span className="mx-1.5 text-ink-faint">/</span>
        <span className="text-ink-soft">Diligence</span>
      </nav>
      <PageHeader
        title="Diligence workspace"
        subtitle="Targeted questions, claim verification, and contradictions — tracked to resolution."
        actions={
          <>
            <Link href={`/vc/opportunities/${id}`} className="btn-secondary">Back to opportunity</Link>
            <button className="btn-primary" onClick={generate}>Generate questions</button>
          </>
        }
      />

      {genError && <ErrorState message={genError} />}

      <Section title="Diligence questions" subtitle="Track each to resolution" flush>
        {diligence.loading ? <div className="p-4"><Spinner /></div> : diligence.error ? <div className="p-4"><ErrorState message={diligence.error} onRetry={diligence.reload} /></div> : (
          <div className="divide-y divide-line">
            {diligence.data?.items.length ? diligence.data.items.map((q) => (
              <div key={q.id} className="px-4 py-3">
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
                  <select className="select h-7 w-auto text-xs" value={q.status} onChange={(e) => setStatus(q.id, e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{humanStatus(s)}</option>)}
                  </select>
                </div>
              </div>
            )) : <p className="px-4 py-6 text-sm text-ink-muted">No questions yet. Generate them from the evidence.</p>}
          </div>
        )}
      </Section>

      <Section title="Claims & trust scores">
        {claims.data ? <ClaimsTable claims={claims.data.items} /> : <Spinner />}
      </Section>

      <Section title="Contradictions & validation failures">
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
