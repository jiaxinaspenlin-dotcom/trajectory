"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, ConfidenceBar, DemoBadge, EmptyState, ErrorState, ScoreRing, Section, Spinner } from "@/components/ui";
import { MomentumChart } from "@/components/MomentumChart";
import { ThreeAxes } from "@/components/ThreeAxes";
import { InvestmentArena } from "@/components/arena/InvestmentArena";
import { ClaimsTable } from "@/components/ClaimsTable";
import { FounderScoreBreakdown } from "@/components/FounderScoreBreakdown";
import { HumanDecisionPanel } from "@/components/HumanDecisionPanel";
import { Claim, Evidence, Opportunity } from "@/lib/types";
import { humanStatus, verificationTone } from "@/lib/format";
import {
  getMyDecision, getPipelineStatus, LocalDecision, PipelineStatus,
  saveMyDecision, setPipelineStatus,
} from "@/lib/myWorkspace";

export default function OpportunityPage() {
  const { id } = useParams<{ id: string }>();
  const { data: o, loading, error, reload } = useFetch<Opportunity>(`/api/opportunities/${id}`);
  const scope = o?.company?.id
    ? `company_id=${o.company.id}`
    : o?.founder?.id
    ? `founder_id=${o.founder.id}`
    : null;
  const claims = useFetch<{ items: Claim[] }>(scope ? `/api/claims?${scope}` : null);
  const contradictions = useFetch<{ items: any[] }>(scope ? `/api/contradictions?${scope}` : null);
  const [busy, setBusy] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [memoBusy, setMemoBusy] = useState(false);
  // per-browser workspace overlay for this opportunity
  const [myStatus, setMyStatus] = useState<PipelineStatus | null>(null);
  const [myDecision, setMyDecision] = useState<LocalDecision | null>(null);
  useEffect(() => {
    const n = Number(id);
    setMyStatus(getPipelineStatus(n));
    setMyDecision(getMyDecision(n));
  }, [id]);

  async function prospectAction(action: string) {
    // Save / Monitor / Dismiss are the investor's personal pipeline — scoped to
    // this browser (like founder applications), never shared with other investors.
    const pipelineMap: Record<string, PipelineStatus> = {
      save: "saved", monitor: "monitoring", dismiss: "dismissed",
    };
    if (pipelineMap[action]) {
      setPipelineStatus(Number(id), pipelineMap[action]);
      setMyStatus(pipelineMap[action]);
      return;
    }
    // Recommend outreach / invite to apply are real, shared workflow steps.
    await api.post(`/api/sourcing/prospects/${id}/action`, { action });
    await reload();
  }

  async function generateMemo() {
    setMemoBusy(true);
    try {
      await api.post(`/api/opportunities/${id}/memo`);
      await reload();
    } catch {
      /* surfaced via the drawer staying empty; full errors live on the print view */
    } finally {
      setMemoBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    setRegenError(null);
    try {
      await api.post(`/api/opportunities/${id}/analyze`);
      await reload();
      claims.reload();
      contradictions.reload();
      setConfirmRegen(false);
    } catch (e) {
      setRegenError(
        e instanceof Error ? e.message : "Analysis failed. Ensure OPENAI_API_KEY is configured."
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading founder…" />;
  if (error) return <ErrorState message={error} />;
  if (!o) return null;

  const founderEvidence: Evidence[] = o.evidence || o.founder?.evidence || [];
  const notAnalyzed = !o.assessment && !o.debate;

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
            {(() => {
              const shown = myStatus ?? o.status;
              const tone = shown === "saved" || shown === "monitoring"
                ? "bg-positive-wash text-positive"
                : shown === "dismissed"
                ? "bg-negative-wash text-negative"
                : "bg-neutral-wash text-neutral";
              return <Badge tone={tone}>{humanStatus(shown)}</Badge>;
            })()}
          </div>
          <p className="mt-1 text-sm text-ink-soft">{o.company?.one_liner}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {o.founder?.full_name} · {o.founder?.headline} · {o.founder?.location}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/vc/opportunities/${id}/diligence`} className="btn-secondary">Diligence Workspace</Link>
          <button className="btn-primary" onClick={() => setConfirmRegen(true)} disabled={busy}>
            {busy ? "Regenerating…" : "Regenerate analysis"}
          </button>
        </div>
      </div>

      {/* clip an outbound prospect to your pipeline */}
      {o.entry_type === "outbound" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-sunken px-4 py-3">
          <span className="text-sm text-ink-soft">Pipeline:</span>
          <button className={`text-xs ${myStatus === "saved" ? "btn-primary" : "btn-secondary"}`} onClick={() => prospectAction("save")}>Save to pipeline</button>
          <button className={`text-xs ${myStatus === "monitoring" ? "btn-primary" : "btn-secondary"}`} onClick={() => prospectAction("monitor")}>Monitor</button>
          <button className={`text-xs ${myStatus === "dismissed" ? "btn-primary" : "btn-ghost"}`} onClick={() => prospectAction("dismiss")}>Dismiss</button>
          <button className="btn-ghost text-xs" onClick={() => prospectAction("recommend_outreach")}>Recommend outreach</button>
          <span className="ml-auto text-xs text-ink-muted">
            {myStatus === "saved" || myStatus === "monitoring"
              ? "Pinned to the top of your dashboard (this browser only)."
              : myStatus === "dismissed"
              ? "Hidden from your dashboard (this browser only)."
              : "Your pipeline is saved in this browser — other investors don't see it."}
          </span>
        </div>
      )}

      {confirmRegen && (
        <div className="rounded-lg border border-brand/30 bg-brand-wash p-4">
          <p className="text-sm text-brand">
            Regenerate the assessment, diligence, Arena debate, and memo with OpenAI? Prior versions are preserved — nothing is overwritten.
          </p>
          <div className="mt-2 flex gap-2">
            <button className="btn-primary" onClick={regenerate} disabled={busy}>Confirm</button>
            <button className="btn-secondary" onClick={() => setConfirmRegen(false)}>Cancel</button>
          </div>
          {regenError && (
            <p className="mt-2 text-sm text-negative">
              {regenError.includes("OPENAI") || regenError.toLowerCase().includes("ai provider")
                ? "AI is not configured. Set OPENAI_API_KEY on the backend to enable analysis. Deterministic scores and the seeded demo analysis remain available."
                : regenError}
            </p>
          )}
        </div>
      )}

      {notAnalyzed && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand-wash px-4 py-3">
          <p className="text-sm text-brand">
            This founder was just sourced. Their GitHub evidence and Founder Score are ready below —
            run analysis to generate the three-axis assessment, the Investment Arena, and the memo.
          </p>
          <button className="btn-primary shrink-0" onClick={() => setConfirmRegen(true)} disabled={busy}>
            {busy ? "Analyzing…" : "Run analysis"}
          </button>
        </div>
      )}

      {/* Investment Arena — full-width illustrated stage; the full memo drops down inline */}
      <InvestmentArena
        debate={o.debate || null}
        memo={o.memo ?? null}
        onGenerateMemo={generateMemo}
        memoBusy={memoBusy}
      />

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

          <Section title="Three Independent Screening Axes" subtitle="Founder · Market · Idea vs Market — never averaged">
            {o.assessment ? <ThreeAxes assessment={o.assessment} /> : (
              <EmptyState title="No assessment yet" hint="Run Regenerate analysis to generate the three axes." />
            )}
          </Section>

          <Section title="Claims & Trust Scores" subtitle="Per-claim trust, verification status, and evidence links">
            {claims.data ? <ClaimsTable claims={claims.data.items} /> : <Spinner />}
          </Section>

          <Section title="Contradictions & Missing Information" subtitle="Surfaced from evidence">
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

          <Section title="Evidence Timeline" subtitle="Normalized, timestamped, attributed" right={o.is_demo ? <DemoBadge /> : undefined}>
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

        {/* right column — decision */}
        <div className="space-y-6">
          <Section title="Recommendation & Human Decision" subtitle="System recommends; a human decides">
            <HumanDecisionPanel
              opportunityId={o.id}
              recommendation={o.current_recommendation || null}
              onDecision={reload}
              savedLocal={myDecision}
              onSavedLocal={(d) => { saveMyDecision(o.id, d); setMyDecision(d); }}
            />
          </Section>
          <Section title="Thesis Fit" subtitle="Evaluated through the active thesis">
            <div className="text-3xl font-semibold text-ink">{Math.round(o.thesis_fit_score)}<span className="text-base text-ink-muted"> / 100</span></div>
            <p className="mt-1 text-sm text-ink-muted">{o.surfaced_reason}</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
