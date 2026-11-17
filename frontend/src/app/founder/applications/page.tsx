"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { EmptyState, SkeletonRows } from "@/components/ui";
import { ArrowRightIcon, DocumentIcon } from "@/components/icons";
import { getMyAppIds } from "@/lib/myApps";
import { sectorLabel } from "@/lib/format";

interface AppDetail {
  id: number;
  company_name: string;
  sector: string | null;
  missing_fields: string[];
  document: { status: string } | null;
}

export default function MyApplications() {
  const [apps, setApps] = useState<AppDetail[] | null>(null);

  useEffect(() => {
    const ids = getMyAppIds();
    if (!ids.length) {
      setApps([]);
      return;
    }
    // fetch only the applications this browser submitted
    Promise.all(ids.map((id) => api.get<AppDetail>(`/api/applications/${id}`).catch(() => null))).then(
      (results) => setApps(results.filter(Boolean) as AppDetail[])
    );
  }, []);

  return (
    <div className="space-y-8">
      <div className="animate-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] font-[650] leading-9 tracking-[-0.025em] text-ink sm:text-page">My Applications</h1>
          <p className="mt-1.5 text-body text-ink-muted">Applications you&rsquo;ve submitted from this device. Each is under review by the fund.</p>
        </div>
        {/* with none yet, the empty state's "Start Your Application" is the action */}
        {!!apps?.length && <Link href="/founder" className="btn-ghost">New Application</Link>}
      </div>

      {apps === null ? (
        <div role="status" aria-label="Loading Applications…"><SkeletonRows rows={2} /></div>
      ) : apps.length ? (
        <ul className="divide-y divide-line">
          {apps.map((a, i) => (
            <li key={a.id} className="animate-rise" style={{ "--i": i } as React.CSSProperties}>
              <Link href={`/founder/application/${a.id}`} className="row-interactive group -mx-3 flex items-center justify-between gap-3 rounded-lg px-3 py-4">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink group-hover:text-brand" data-content>{a.company_name}</p>
                  <p className="text-meta text-ink-muted">
                    {a.sector ? sectorLabel(a.sector) : "Sector Not Set"}
                    {" · "}
                    {a.document?.status === "extracted" ? <span className="text-positive">Deck Received</span> : <span className="text-caution">Deck Pending</span>}
                    {a.missing_fields.length ? ` · ${a.missing_fields.length} Item${a.missing_fields.length === 1 ? "" : "s"} Would Help` : ""}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand">
                  {a.missing_fields.length > 0 && "Add Details"}
                  <ArrowRightIcon size={16} className="slide-arrow" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<DocumentIcon size={20} />}
          title="You Haven't Applied Yet"
          hint="It takes under a minute with a company name and a PDF pitch deck."
          action={<Link href="/founder" className="btn-primary">Start Your Application</Link>}
        />
      )}
    </div>
  );
}
