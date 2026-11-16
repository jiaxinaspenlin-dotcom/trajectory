"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { nextActionHref, opportunityName } from "@/lib/pipeline";
import { PipelineDeal } from "@/lib/types";
import { SourceBadge, StageBadge } from "./DealBadges";

export function PipelineTable({ deals }: { deals: PipelineDeal[] }) {
  const router = useRouter();
  return (
    // `relative` makes this the containing block for absolutely positioned
    // children (e.g. sr-only headers), so they scroll here instead of widening the page
    <div className="card relative overflow-x-auto">
      <table className="table min-w-[820px]">
        <thead>
          <tr>
            <th scope="col">Opportunity</th>
            <th scope="col">Stage</th>
            <th scope="col">Next Action</th>
            <th scope="col" className="text-right" title="Fit Against Your Fund Thesis, 0–100">Thesis Fit</th>
            <th scope="col" className="text-right">Founder Score</th>
            <th scope="col" className="text-right">Waiting</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => {
            const href = `/vc/opportunities/${d.id}`;
            const actionHref = nextActionHref(d.id, d.next_action_key);
            const founderName = d.founder?.full_name;
            return (
              <tr key={d.id} data-testid={`deal-row-${d.id}`} onClick={() => router.push(href)} className="table-row-link">
                <td className="max-w-[340px]">
                  <span className="flex items-center gap-2">
                    <Link href={href} onClick={(e) => e.stopPropagation()} className="truncate font-medium text-ink hover:text-brand" data-content>
                      {opportunityName(d)}
                    </Link>
                    <SourceBadge entryType={d.entry_type} />
                  </span>
                  <p className="truncate text-[13px] text-ink-muted">
                    {d.company
                      ? (founderName || d.company.one_liner ? <span data-content>{[founderName, d.company.one_liner].filter(Boolean).join(" · ")}</span> : "Founder Not Linked Yet")
                      : "No Company Yet"}
                  </p>
                </td>
                <td><StageBadge stage={d.stage} /></td>
                <td>
                  {d.next_action ? (
                    <>
                      <Link
                        href={actionHref}
                        onClick={(e) => e.stopPropagation()}
                        className={`inline-flex items-center gap-1.5 hover:text-brand hover:underline ${d.priority === 1 ? "font-semibold text-ink" : "font-medium text-ink-soft"}`}
                      >
                        {d.priority === 1 && <span aria-label="Awaiting Your Review" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                        {d.next_action} →
                      </Link>
                      {d.next_action_detail && <span className="block text-[13px] text-ink-muted">{d.next_action_detail}</span>}
                    </>
                  ) : <span className="text-[13px] text-ink-muted">None — Decided</span>}
                </td>
                <td className="text-right">
                  {/* thesis fit is computed from a company; GitHub-sourced founders without one carry a 0 placeholder */}
                  {d.company ? <span className="num text-ink-soft">{Math.round(d.thesis_fit_score)}</span> : <span className="text-[13px] text-ink-muted" title="Thesis Fit Needs a Company">No Company</span>}
                </td>
                <td className="text-right">
                  {d.founder_score ? <span className="num text-ink-soft">{Math.round(d.founder_score.score)}</span> : <span className="text-[13px] text-ink-muted">Not Scored</span>}
                </td>
                <td className="num text-right text-[13px] text-ink-muted">{d.age_days === 0 ? "Today" : `${d.age_days}d`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
