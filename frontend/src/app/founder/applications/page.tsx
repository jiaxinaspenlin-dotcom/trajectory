"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, EmptyState, Spinner } from "@/components/ui";
import { getMyAppIds } from "@/lib/myApps";

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-ink">My applications</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Applications you&rsquo;ve submitted from this device.</p>
        </div>
        {/* with none yet, the empty state's "Start your application" is the action */}
        {!!apps?.length && <Link href="/founder" className="btn-secondary">New application</Link>}
      </div>

      {apps === null ? (
        <Spinner label="Loading applications…" />
      ) : apps.length ? (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {apps.map((a) => (
              <li key={a.id}>
                <Link href={`/founder/application/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-sunken">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{a.company_name}</p>
                    <p className="text-xs text-ink-muted">{a.sector || "Sector not set"}{a.missing_fields.length ? ` · ${a.missing_fields.length} item${a.missing_fields.length === 1 ? "" : "s"} would help` : ""}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {a.missing_fields.length > 0 && <span className="text-sm font-medium text-brand">Add details →</span>}
                    {a.document?.status === "extracted" ? (
                      <Badge tone="bg-positive-wash text-positive">Deck received</Badge>
                    ) : (
                      <Badge tone="bg-caution-wash text-caution">Deck pending</Badge>
                    )}
                    <Badge tone="bg-brand-wash text-brand">Under review</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState
          title="You haven't applied yet"
          hint="It takes under a minute with a company name and a PDF pitch deck."
          action={<Link href="/founder" className="btn-primary">Start your application</Link>}
        />
      )}
    </div>
  );
}
