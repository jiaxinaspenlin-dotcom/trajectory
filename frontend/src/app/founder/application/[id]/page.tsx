"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { Badge, ErrorState, Section, Spinner, Stat } from "@/components/ui";

interface ApplicationDetail {
  id: number;
  company_id: number;
  company_name: string;
  founder_names: string[];
  sector: string | null;
  geography: string | null;
  missing_fields: string[];
  screen_summary: string;
  current_revenue: number | null;
  num_users: number | null;
  funding_requested: number | null;
  document: { id: number; num_pages: number; status: string; page_count: number } | null;
}

export default function ApplicationStatus() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useFetch<ApplicationDetail>(`/api/applications/${id}`);

  if (loading) return <Spinner label="Loading application…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const deckReady = data.document && data.document.status === "extracted";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">{data.company_name}</h1>
            <Badge tone="bg-positive-wash text-positive">under review</Badge>
          </div>
          <p className="text-sm text-ink-muted">{data.sector || "Sector not set"} · {data.geography || "Geography not set"}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/founder" className="btn-secondary">All applications</Link>
          {!deckReady && <Link href="/founder/apply" className="btn-primary">Upload pitch deck</Link>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Pitch deck" value={deckReady ? "Received" : "Pending"} sub={data.document ? `${data.document.num_pages} pages parsed` : "Not uploaded yet"} tone={deckReady ? "text-positive" : "text-caution"} />
        <Stat label="Users (reported)" value={data.num_users ?? "—"} />
        <Stat label="Funding requested" value={data.funding_requested ? `$${data.funding_requested.toLocaleString()}` : "—"} />
      </div>

      <Section title="First-pass screen" subtitle="Automated, before human review">
        <p className="text-sm text-ink-soft">{data.screen_summary || "Your application is queued for screening."}</p>
      </Section>

      <Section title="What the fund still needs from you" subtitle="Only what genuinely helps a confident decision">
        {data.missing_fields.length > 0 ? (
          <ul className="space-y-2">
            {data.missing_fields.map((m) => (
              <li key={m} className="flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-soft">
                <Badge tone="bg-caution-wash text-caution">requested</Badge> {m}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">Nothing outstanding right now — the fund has what it needs to begin.</p>
        )}
      </Section>

      <div className="rounded-xl border border-line bg-surface-sunken p-4 text-sm text-ink-muted">
        A human investor reviews every application and makes the final decision. Trajectory never
        auto-invests or sends automated messages. You&rsquo;ll be contacted with a next step
        (interview, information request, or a pass) — the fund aims for within 24 hours.
      </div>
    </div>
  );
}
