"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { humanStatus, trajectoryTone } from "@/lib/format";
import { PipelineStatus } from "@/lib/myWorkspace";
import { inPipeline, leadStatus } from "@/lib/pipeline";
import { FounderLead } from "@/lib/types";
import { ProspectStatusBadge, StageBadge } from "./DealBadges";
import { Badge } from "./ui";

const STATUS_OPTIONS: { value: PipelineStatus; label: string }[] = [
  { value: "saved", label: "Saved" },
  { value: "monitoring", label: "Monitoring" },
  { value: "dismissed", label: "Dismissed" },
];

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function FoundersTable({
  leads,
  overlay,
  onSetStatus,
  onMoveToScreening,
}: {
  leads: FounderLead[];
  overlay: Record<number, PipelineStatus>;
  onSetStatus: (id: number, status: PipelineStatus | null) => void;
  // investor-approved transition into Screening (shared, on the same opportunity ID)
  onMoveToScreening: (id: number) => Promise<void>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  async function confirmMove(id: number) {
    setBusy(id);
    setRowError(null);
    try {
      await onMoveToScreening(id);
      setConfirming(null);
    } catch (e) {
      setRowError({ id, message: e instanceof Error ? e.message : "Could not move to screening." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-sunken">
            {["Founder", "Company / Project", "Signals", "Status", ""].map((h, i) => (
              <th key={i} scope="col" className={`label px-4 py-2.5 ${i === 4 ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const href = `/vc/opportunities/${l.id}`;
            const status = leadStatus(l, overlay[l.id] ?? null);
            const m = l.momentum;
            return (
              <tr
                key={l.id}
                data-testid={`founder-row-${l.id}`}
                onClick={() => router.push(href)}
                className="cursor-pointer border-t border-line align-top transition-colors hover:bg-surface-sunken"
              >
                {/* founder */}
                <td className="px-4 py-3">
                  <Link href={href} onClick={stop} className="font-semibold text-ink hover:text-brand">
                    {l.founder?.full_name || l.company?.name || `Opportunity #${l.id}`}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                    {l.founder?.github_username && (
                      <a
                        href={`https://github.com/${l.founder.github_username}`}
                        target="_blank" rel="noreferrer" onClick={stop}
                        className="text-brand hover:underline"
                      >
                        @{l.founder.github_username} ↗
                      </a>
                    )}
                    {l.founder?.location && <span>{l.founder.location}</span>}
                    {!l.founder && <span>Founder not linked yet</span>}
                  </div>
                </td>

                {/* company or project */}
                <td className="max-w-[280px] px-4 py-3">
                  {l.company ? (
                    <>
                      <p className="font-medium text-ink">{l.company.name}</p>
                      {l.company.one_liner && <p className="truncate text-xs text-ink-muted">{l.company.one_liner}</p>}
                    </>
                  ) : l.top_project ? (
                    <>
                      <p className="text-xs text-ink-muted">No company yet · top project</p>
                      {l.top_project.url ? (
                        <a href={l.top_project.url} target="_blank" rel="noreferrer" onClick={stop} className="font-medium text-brand hover:underline">
                          {l.top_project.name} ↗
                        </a>
                      ) : <p className="font-medium text-ink">{l.top_project.name}</p>}
                      {l.top_project.stars != null && (
                        <span className="ml-1 text-xs text-ink-muted" title="External interest only, not traction">★ {l.top_project.stars}</span>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-ink-muted">No company yet</p>
                  )}
                </td>

                {/* momentum + evidence */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {l.founder_score ? (
                      <Badge tone="bg-brand-wash text-brand" title={`Confidence ${Math.round(l.founder_score.confidence * 100)}%`}>
                        Score {Math.round(l.founder_score.score)}
                      </Badge>
                    ) : <Badge>Not scored</Badge>}
                    {m && (
                      <Badge tone={trajectoryTone(m.trajectory)}>
                        {humanStatus(m.trajectory)}
                        {m.change_30d != null && ` ${m.change_30d >= 0 ? "+" : ""}${Math.round(m.change_30d)} 30d`}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {l.evidence_count ? `${l.evidence_count} evidence item${l.evidence_count === 1 ? "" : "s"}` : "No evidence collected yet"}
                  </p>
                </td>

                {/* prospect status + pipeline stage */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ProspectStatusBadge status={status} />
                    {inPipeline(l) && <StageBadge stage={l.stage} />}
                  </div>
                  <select
                    aria-label={`Prospect status for ${l.founder?.full_name || l.id}`}
                    className="mt-1.5 rounded-md border border-line bg-white px-1.5 py-0.5 text-xs text-ink-soft"
                    value={overlay[l.id] ?? ""}
                    onClick={stop}
                    onChange={(e) => onSetStatus(l.id, (e.target.value || null) as PipelineStatus | null)}
                  >
                    {/* the blank option is an action, not a value: the badge above shows the current status */}
                    <option value="">{overlay[l.id] ? "Clear my status" : "Set my status…"}</option>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>

                {/* actions */}
                <td className="px-4 py-3 text-right" onClick={stop}>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {inPipeline(l) ? (
                      <Link href={`/vc/pipeline?stage=${l.stage}`} className="btn-ghost text-xs">View in Pipeline</Link>
                    ) : confirming === l.id ? (
                      <>
                        <button className="btn-primary text-xs" onClick={() => confirmMove(l.id)} disabled={busy === l.id}>
                          {busy === l.id ? "Moving…" : "Confirm move"}
                        </button>
                        <button className="btn-ghost text-xs" onClick={() => setConfirming(null)} disabled={busy === l.id}>Cancel</button>
                      </>
                    ) : (
                      <button
                        className="btn-secondary text-xs"
                        onClick={() => { setConfirming(l.id); setRowError(null); }}
                        title="Approve moving this founder into Screening. Nothing is sent to the founder."
                      >
                        Move to Screening
                      </button>
                    )}
                    <Link href={href} className="btn-secondary text-xs">Review →</Link>
                  </div>
                  {confirming === l.id && (
                    <p className="mt-1 text-xs text-ink-muted">Moves this lead into the fund&apos;s Pipeline at Screening. No outreach is sent.</p>
                  )}
                  {rowError?.id === l.id && <p className="mt-1 text-xs text-negative" role="alert">{rowError.message}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
