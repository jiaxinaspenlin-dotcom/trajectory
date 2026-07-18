"use client";

import Link from "next/link";
import { useFetch } from "@/lib/useFetch";
import { Badge, EmptyState, ErrorState, Section, Spinner } from "@/components/ui";

interface AppRow {
  id: number;
  company_name: string;
  sector: string | null;
  missing_fields: string[];
  has_deck: boolean;
}

export default function FounderHome() {
  const { data, loading, error } = useFetch<{ items: AppRow[] }>("/api/applications");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Your applications</h1>
          <p className="text-sm text-ink-muted">
            Apply to the fund and track what happens next. You only need a company name and a pitch deck.
          </p>
        </div>
        <Link href="/founder/apply" className="btn-primary">Start a new application</Link>
      </div>

      <Section title="Applications" subtitle="Everything you have submitted">
        {loading ? <Spinner /> : error ? <ErrorState message={error} /> : data && data.items.length ? (
          <div className="space-y-2">
            {data.items.map((a) => (
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
                  {a.has_deck ? (
                    <Badge tone="bg-positive-wash text-positive">deck uploaded</Badge>
                  ) : (
                    <Badge tone="bg-caution-wash text-caution">deck pending</Badge>
                  )}
                  {a.missing_fields.length > 0 && (
                    <Badge tone="bg-neutral-wash text-neutral">{a.missing_fields.length} items requested</Badge>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No applications yet"
            hint="Apply with your company name and a PDF pitch deck — it takes under a minute."
            action={<Link href="/founder/apply" className="btn-primary">Apply now</Link>}
          />
        )}
      </Section>

      <Section title="How review works" subtitle="What the fund does with your application">
        <ol className="space-y-2 text-sm text-ink-soft">
          <li><strong>1. First-pass screen.</strong> We validate and read your deck and run a fast automated screen.</li>
          <li><strong>2. Evidence &amp; verification.</strong> The fund gathers independent evidence (e.g. public GitHub) and checks your claims.</li>
          <li><strong>3. Decision within 24 hours.</strong> The fund aims to give an actionable next step — invite to interview, request more info, or pass. A human always makes the final call.</li>
        </ol>
      </Section>
    </div>
  );
}
