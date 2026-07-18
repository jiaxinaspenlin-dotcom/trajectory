"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, ConfidenceBar, DemoBadge, EmptyState, ErrorState, ScoreRing, Section, Spinner } from "@/components/ui";
import { MomentumChart } from "@/components/MomentumChart";
import { ThreeAxes } from "@/components/ThreeAxes";
import { InvestmentArena } from "@/components/arena/InvestmentArena";
import { ClaimsTable } from "@/components/ClaimsTable";
import { WorkflowTimer } from "@/components/WorkflowTimer";
import { FounderScoreBreakdown } from "@/components/FounderScoreBreakdown";
import { HumanDecisionPanel } from "@/components/HumanDecisionPanel";
import { Claim, Evidence, Opportunity } from "@/lib/types";
import { humanStatus, verificationTone } from "@/lib/format";

export default function OpportunityPage() {
  const { id } = useParams<{ id: string }>();
  const { data: o, loading, error, reload } = useFetch<Opportunity>(`/api/opportunities/${id}`);
  const claims = useFetch<{ items: Claim[] }>(o?.company?.id ? `/api/claims?company_id=${o.company.id}` : null);
  const contradictions = useFetch<{ items: any[] }>(`/api/contradictions${o?.company?.id ? `?company_id=${o.company.id}` : ""}`);
  const [busy, setBusy] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  async function regenerate() {
    setBusy(true);
    try {
      await api.post(`/api/opportunities/${id}/analyze`);
      await reload();
      claims.reload();
      contradictions.reload();
    } finally {
      setBusy(false);
      setConfirmRegen(false);
    }
  }

  if (loading) return <Spinner label="Loading founder…" />;
  if (error) return <ErrorState message={error} />;
  if (!o) return null;

  const founderEvidence: Evidence[] = o.founder?.evidence || [];

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">{o.company?.name || o.founder?.full_name}</h1>
            {o.is_demo && <DemoBadge />}
            <Badge tone="bg-neutral-wash text-neutral">{humanStatus(o.entry_type)}</Badge>
            <Badge tone="bg-brand-wash text-brand">{humanStatus(o.stage)}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-soft">{o.company?.one_liner}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {o.founder?.full_name} · {o.founder?.headline} · {o.founder?.location}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/opportunities/${id}/diligence`} className="btn-secondary">Diligence workspace</Link>
          <Link href={`/opportunities/${id}/memo`} className="btn-secondary">Investment memo</Link>
          <button className="btn-primary" onClick={() => setConfirmRegen(true)} disabled={busy}>
            {busy ? "Regenerating…" : "Regenerate analysis"}
          </button>
        </div>
      </div>

      {confirmRegen && (
        <div className="rounded-lg border border-brand/30 bg-brand-wash p-4">
          <p className="text-sm text-brand">
            Regenerate the assessment, diligence, Arena debate, and memo? Prior versions are preserved — nothing is overwritten.
          </p>
          <div className="mt-2 flex gap-2">
            <button className="btn-primary" onClick={regenerate} disabled={busy}>Confirm</button>
            <button className="btn-secondary" onClick={() => setConfirmRegen(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* main column */}
        <div className="space-y-6 lg:col-span-2">
          <Section title="Persistent Founder Score" subtitle="Deterministic baseline, explained — persists across companies">
            {o.founder_score ? (
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex flex-col items-center">
                  <ScoreRing score={o.founder_score.score} size={96} />
                  <div className="mt-2"><ConfidenceBar value={o.founder_score.confidence} /></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-ink-soft">{o.founder_score.explanation}</p>
                  <FounderScoreBreakdown components={o.founder_score.components} />
                </div>
              </div>
            ) : <EmptyState title="No score yet" hint="Sync evidence to compute a Founder Score." />}
          </Section>

          <Section title="Founder Momentum" subtitle="Direction & rate of change over time">
            {o.momentum ? <MomentumChart momentum={o.momentum} /> : <EmptyState title="No momentum history" />}
          </Section>

          <Section title="Three independent screening axes" subtitle="Founder · Market · Idea vs Market — never averaged">
            {o.assessment ? <ThreeAxes assessment={o.assessment} /> : (
              <EmptyState title="No assessment yet" hint="Run Regenerate analysis to generate the three axes." />
            )}
          </Section>

          <Section title="Claims & Trust Scores" subtitle="Per-claim trust, verification status, and evidence links">
            {claims.data ? <ClaimsTable claims={claims.data.items} /> : <Spinner />}
          </Section>

          <Section title="Contradictions & missing information" subtitle="Surfaced from evidence">
            {contradictions.data?.items.length ? (
              <ul className="space-y-2">
                {contradictions.data.items.map((c) => (
                  <li key={c.id} className="rounded-lg border border-negative/30 bg-negative-wash p-3 text-sm text-negative">
                    <Badge tone="bg-white text-negative">{c.severity}</Badge> {c.description}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-muted">No contradictions detected.</p>}
          </Section>

          <Section title="Evidence timeline" subtitle="Normalized, timestamped, attributed" right={o.is_demo ? <DemoBadge /> : undefined}>
            {founderEvidence.length ? (
              <ol className="relative space-y-3 border-l border-line pl-4">
                {founderEvidence.slice(0, 20).map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink-soft">{e.title}</span>
                      <span className="font-mono text-[11px] text-ink-muted">E{e.id}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span>{e.source_name}</span>
                      <Badge tone={verificationTone(e.verification_status)}>{humanStatus(e.verification_status)}</Badge>
                      <span>{e.event_date ? new Date(e.event_date).toLocaleDateString() : ""}</span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-ink-muted">No evidence collected for this founder yet.</p>}
          </Section>
        </div>

        {/* right column — Arena + decision */}
        <div className="space-y-6">
          <WorkflowTimer w={o.workflow!} />
          <InvestmentArena debate={o.debate || null} />
          <Section title="Recommendation & human decision" subtitle="System recommends; a human decides">
            <HumanDecisionPanel opportunityId={o.id} recommendation={o.workflow?.current_recommendation || null} onDecision={reload} />
          </Section>
          <Section title="Thesis fit" subtitle="Evaluated through the active thesis">
            <div className="text-3xl font-semibold text-ink">{Math.round(o.thesis_fit_score)}<span className="text-base text-ink-muted"> / 100</span></div>
            <p className="mt-1 text-sm text-ink-muted">{o.surfaced_reason}</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
