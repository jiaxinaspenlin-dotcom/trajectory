"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, EmptyState, Section, Spinner } from "@/components/ui";
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">My Applications</h1>
          <p className="text-sm text-ink-muted">Applications you&rsquo;ve submitted from this device.</p>
        </div>
        <Link href="/founder" className="btn-primary">Start a New Application</Link>
      </div>

      <Section title="Submitted">
        {apps === null ? (
          <Spinner />
        ) : apps.length ? (
          <div className="space-y-2">
            {apps.map((a) => (
              <Link
                key={a.id}
                href={`/founder/application/${a.id}`}
                className="flex items-center justify-between rounded-lg border border-line bg-surface p-3 hover:border-positive/40"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{a.company_name}</p>
                  <p className="text-xs text-ink-muted">{a.sector || "Sector not set"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {a.document?.status === "extracted" ? (
                    <Badge tone="bg-positive-wash text-positive">Deck Received</Badge>
                  ) : (
                    <Badge tone="bg-caution-wash text-caution">Deck Pending</Badge>
                  )}
                  <Badge tone="bg-neutral-wash text-neutral">Under Review</Badge>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="You haven't applied yet"
            hint="Start an application — it takes under a minute with a company name and a PDF pitch deck."
            action={<Link href="/founder" className="btn-primary">Start Your Application</Link>}
          />
        )}
      </Section>
    </div>
  );
}
