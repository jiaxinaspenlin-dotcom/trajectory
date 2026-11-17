"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, Button, EmptyState, ErrorState, Meter, PageHeader, PageSkeleton, Section, Skeleton } from "@/components/ui";
import { ClaimsTable } from "@/components/ClaimsTable";
import { EvidenceLinkProvider } from "@/components/EvidenceRef";
import { CheckIcon } from "@/components/icons";
import { Claim, DiligenceQuestion, Opportunity } from "@/lib/types";
import { humanStatus } from "@/lib/format";
import { evidenceHref } from "@/lib/pipeline";

const STATUSES = ["open", "requested", "answered", "verified", "unresolved", "not_applicable"];
const RESOLVED = new Set(["answered", "verified", "not_applicable"]);

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
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  async function generate() {
    setGenError(null);
    setBusy(true);
    try {
      await api.post(`/api/opportunities/${id}/diligence`);
      diligence.reload();
    } catch (e) {
      setGenError(
        e instanceof Error && (e.message.toLowerCase().includes("ai provider") || e.message.includes("OPENAI"))
          ? "AI is not configured — set OPENAI_API_KEY to generate new questions. Seeded demo questions remain available."
          : e instanceof Error ? e.message : "Generation failed."
      );
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(qid: number, status: string) {
    await api.put(`/api/diligence/${qid}/status`, { status });
    diligence.reload();
    setSavedId(qid);
    setTimeout(() => setSavedId((v) => (v === qid ? null : v)), 1600);
  }

  if (opp.loading && !opp.data) return <PageSkeleton label="Loading Diligence…" />;
  const name = opp.data?.company?.name || opp.data?.founder?.full_name;
  const items = diligence.data?.items ?? [];
  const resolved = items.filter((q) => RESOLVED.has(q.status)).length;
  // open work first, resolved last; otherwise the order they were raised
  const ordered = [...items].sort((a, b) => Number(RESOLVED.has(a.status)) - Number(RESOLVED.has(b.status)));

  return (
    <EvidenceLinkProvider href={(eid) => evidenceHref(Number(id), eid)}>
    <div className="max-w-4xl space-y-10">
      <div className="space-y-3">
        <Link href={`/vc/opportunities/${id}`} className="link text-meta text-ink-muted hover:text-ink">← {name ? <span data-content>{name}</span> : "Back to the Record"}</Link>
        <PageHeader
          title="Diligence"
          subtitle="Targeted questions, claim verification, and contradictions — tracked to resolution."
          actions={items.length > 0 && <Button onClick={generate} busy={busy}>Generate Questions</Button>}
        />
      </div>

      {genError && <ErrorState message={genError} />}

      <Section title="Questions" card={false}
        right={items.length > 0 && (
          <div className="w-48 text-right">
            <p className="num text-meta text-ink-muted"><span className="font-semibold text-ink">{resolved}</span> of {items.length} Resolved</p>
            <div className="mt-1.5"><Meter value={items.length ? resolved / items.length : 0} className="bg-positive" /></div>
          </div>
        )}>
        {diligence.loading && !diligence.data ? (
          <div className="space-y-3" role="status" aria-label="Loading Questions…">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
        ) : diligence.error ? <ErrorState message={diligence.error} onRetry={diligence.reload} /> : items.length ? (
          <ol className="divide-y divide-line">
            {ordered.map((q, i) => (
              <li key={q.id} className="animate-rise grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto]" style={{ "--i": i } as React.CSSProperties}>
                <div className="min-w-0">
                  <p className={`text-[15px] font-medium ${RESOLVED.has(q.status) ? "text-ink-muted" : "text-ink"}`}>{q.question}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">{q.rationale}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                    <span>{humanStatus(q.category)}</span>
                    <span aria-hidden>·</span>
                    <span>{`Via ${humanStatus(q.generated_by)}`}</span>
                    {q.related_claim_ids.map((c) => <span key={c} className="rounded bg-surface-sunken px-1 font-mono">C{c}</span>)}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                  <label className="sr-only" htmlFor={`q-${q.id}`}>Status</label>
                  <select id={`q-${q.id}`} className="select h-9 w-auto min-w-[9rem] text-sm" value={q.status} onChange={(e) => setStatus(q.id, e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{humanStatus(s)}</option>)}
                  </select>
                  {savedId === q.id && <span className="animate-fade flex items-center gap-1 text-xs text-positive" role="status"><CheckIcon size={12} className="check-draw" /> Saved</span>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No Questions Yet" hint="Generate targeted questions from the evidence and claims." action={<Button variant="primary" onClick={generate} busy={busy}>Generate Questions</Button>} />
        )}
      </Section>

      <Section title="Claims & Trust Scores" card={false}>
        {claims.data ? <ClaimsTable claims={claims.data.items} /> : <div role="status" aria-label="Loading Claims…" className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
      </Section>

      <Section title="Contradictions & Validation Failures" card={false}>
        {contradictions.data?.items.length ? (
          <ul className="divide-y divide-line">
            {contradictions.data.items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-2 py-3 text-sm text-ink-soft">
                <Badge tone="bg-negative-wash text-negative">{humanStatus(c.severity)}</Badge>
                <span className="min-w-0 flex-1">{c.description}</span>
                <span className="text-xs text-ink-muted">Detected by {humanStatus(c.detected_by)}</span>
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
    </EvidenceLinkProvider>
  );
}
