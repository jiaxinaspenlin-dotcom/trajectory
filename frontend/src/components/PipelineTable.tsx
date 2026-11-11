"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { opportunityName } from "@/lib/pipeline";
import { PipelineDeal } from "@/lib/types";
import { SourceBadge, StageBadge } from "./DealBadges";

export function PipelineTable({ deals }: { deals: PipelineDeal[] }) {
  const router = useRouter();
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-sunken">
            {["Opportunity", "Source", "Stage", "Next action", "Fit", "Founder score", "Age"].map((h) => (
              <th key={h} scope="col" className="label px-4 py-2.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => {
            const href = `/vc/opportunities/${d.id}`;
            const founderName = d.founder?.full_name;
            return (
              <tr
                key={d.id}
                data-testid={`deal-row-${d.id}`}
                onClick={() => router.push(href)}
                className="cursor-pointer border-t border-line transition-colors hover:bg-surface-sunken"
              >
                <td className="max-w-[320px] px-4 py-3">
                  <Link href={href} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink hover:text-brand">
                    {opportunityName(d)}
                  </Link>
                  <p className="truncate text-xs text-ink-muted">
                    {d.company
                      ? [founderName, d.company.one_liner].filter(Boolean).join(" · ") || "Founder not linked yet"
                      : "No company yet"}
                  </p>
                </td>
                <td className="px-4 py-3"><SourceBadge entryType={d.entry_type} /></td>
                <td className="px-4 py-3"><StageBadge stage={d.stage} /></td>
                <td className="px-4 py-3">
                  {d.next_action ? (
                    <span className={d.priority === 1 ? "font-medium text-brand" : "text-ink-soft"}>{d.next_action}</span>
                  ) : <span className="text-xs text-ink-muted">None — decided</span>}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {/* thesis fit is computed from a company; GitHub-sourced founders without one carry a 0 placeholder */}
                  {d.company ? <span className="text-ink-soft">{Math.round(d.thesis_fit_score)}</span> : <span className="text-xs text-ink-muted">Not computed</span>}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {d.founder_score ? <span className="text-ink-soft">{Math.round(d.founder_score.score)}</span> : <span className="text-xs text-ink-muted">Not scored</span>}
                </td>
                <td className="px-4 py-3 text-xs text-ink-muted">{d.age_days === 0 ? "today" : `${d.age_days}d`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
