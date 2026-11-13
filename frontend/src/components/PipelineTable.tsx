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
      <table className="table min-w-[860px]">
        <thead>
          <tr>
            <th scope="col">Opportunity</th>
            <th scope="col">Source</th>
            <th scope="col">Stage</th>
            <th scope="col">Next action</th>
            <th scope="col" className="text-right">Fit</th>
            <th scope="col" className="text-right">Founder score</th>
            <th scope="col" className="text-right">Age</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => {
            const href = `/vc/opportunities/${d.id}`;
            const founderName = d.founder?.full_name;
            return (
              <tr key={d.id} data-testid={`deal-row-${d.id}`} onClick={() => router.push(href)} className="table-row-link">
                <td className="max-w-[340px]">
                  <Link href={href} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-brand">
                    {opportunityName(d)}
                  </Link>
                  <p className="truncate text-xs text-ink-muted">
                    {d.company
                      ? [founderName, d.company.one_liner].filter(Boolean).join(" · ") || "Founder not linked yet"
                      : "No company yet"}
                  </p>
                </td>
                <td><SourceBadge entryType={d.entry_type} /></td>
                <td><StageBadge stage={d.stage} /></td>
                <td>
                  {d.next_action ? (
                    <span className={`flex items-center gap-1.5 ${d.priority === 1 ? "font-medium text-ink" : "text-ink-soft"}`}>
                      {d.priority === 1 && <span aria-label="Act now" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                      {d.next_action}
                    </span>
                  ) : <span className="text-xs text-ink-muted">None — decided</span>}
                </td>
                <td className="text-right">
                  {/* thesis fit is computed from a company; GitHub-sourced founders without one carry a 0 placeholder */}
                  {d.company ? <span className="num text-ink-soft">{Math.round(d.thesis_fit_score)}</span> : <span className="text-xs text-ink-muted">Not computed</span>}
                </td>
                <td className="text-right">
                  {d.founder_score ? <span className="num text-ink-soft">{Math.round(d.founder_score.score)}</span> : <span className="text-xs text-ink-muted">Not scored</span>}
                </td>
                <td className="num text-right text-xs text-ink-muted">{d.age_days === 0 ? "today" : `${d.age_days}d`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
