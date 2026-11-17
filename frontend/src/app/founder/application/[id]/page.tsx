"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { sectorLabel } from "@/lib/format";
import { Badge, Button, ErrorState, PageSkeleton, Section } from "@/components/ui";
import { CheckIcon } from "@/components/icons";

interface ApplicationDetail {
  id: number;
  company_id: number;
  company_name: string;
  founder_names: string[];
  sector: string | null;
  geography: string | null;
  website: string | null;
  product_link: string | null;
  github_profile: string | null;
  team_info: string | null;
  missing_fields: string[];
  screen_summary: string;
  current_revenue: number | null;
  num_users: number | null;
  funding_requested: number | null;
  document: { id: number; num_pages: number; status: string; page_count: number } | null;
}

export default function ApplicationStatus() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useFetch<ApplicationDetail>(`/api/applications/${id}`);

  if (loading) return <PageSkeleton label="Loading Application…" rows={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const deckReady = data.document && data.document.status === "extracted";

  return (
    <div className="space-y-10">
      <div className="animate-rise space-y-3">
      <nav aria-label="Breadcrumb" className="text-meta text-ink-muted">
        <Link href="/founder/applications" className="link text-ink-muted hover:text-ink">My Applications</Link>
        <span className="mx-1.5 text-ink-faint">/</span>
        <span className="text-ink-soft" data-content>{data.company_name}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[1.75rem] font-[650] leading-9 tracking-[-0.025em] text-ink sm:text-page" data-content>{data.company_name}</h1>
            <Badge tone="bg-brand-wash text-brand">Under Review</Badge>
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">{data.sector ? sectorLabel(data.sector) : "Sector Not Set"} · {data.geography ? <span data-content>{data.geography}</span> : "Location Not Set"}</p>
        </div>
        {!deckReady && <Link href="/founder" className="btn-primary">Finish Your Application</Link>}
      </div>
      </div>

      {/* where it stands: three steps as one bar */}
      <div>
        <ol className="grid grid-cols-3 gap-2" aria-label="Application Status">
          {([
            ["Application Received", true],
            ["Pitch Deck Read", !!deckReady],
            ["Human Review", false],
          ] as const).map(([label, done], i) => (
            <li key={label}>
              <span className="block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                <span className={`block h-full origin-left rounded-full transition-transform duration-[500ms] ease-out ${done ? "bg-positive" : "bg-brand/50"}`}
                  style={{ transform: `scaleX(${done ? 1 : i === 2 ? 0.35 : 0})`, transitionDelay: `${i * 100}ms` }} />
              </span>
              <span className={`mt-2 flex items-center gap-1.5 text-sm ${done ? "text-ink" : "text-ink-muted"}`}>
                {done && <CheckIcon size={13} className="text-positive" />}{label}
              </span>
            </li>
          ))}
        </ol>
        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><dt className="label">Pitch Deck</dt><dd className={`mt-0.5 font-medium ${deckReady ? "text-positive" : "text-caution"}`}>{deckReady ? "Received" : "Pending"} <span className="font-normal text-ink-muted">· {data.document ? `${data.document.num_pages} Pages Parsed` : "Not Uploaded Yet"}</span></dd></div>
          <div><dt className="label">Users (Reported)</dt><dd className="num mt-0.5 font-medium text-ink">{data.num_users ?? "—"}</dd></div>
          <div><dt className="label">Funding Requested</dt><dd className="num mt-0.5 font-medium text-ink">{data.funding_requested ? `$${data.funding_requested.toLocaleString()}` : "—"}</dd></div>
        </dl>
      </div>

      <Section title="First-Pass Screen" subtitle="Automated, Before Human Review" card={false}>
        <p className="text-sm leading-6 text-ink-soft">{data.screen_summary || "Your application is queued for screening."}</p>
      </Section>

      <ProvideInfo app={data} onSaved={reload} />

      <p className="text-xs leading-5 text-ink-muted">
        A human investor reviews every application and makes the final decision. Trajectory never auto-invests or sends automated
        messages. You&rsquo;ll be contacted with a next step — an interview, an information request, or a pass.
      </p>
    </div>
  );
}

function ProvideInfo({ app, onSaved }: { app: ApplicationDetail; onSaved: () => void }) {
  const [form, setForm] = useState({
    website: "", product_link: "", github_profile: "", num_users: "", current_revenue: "",
    team_info: "", customer_info: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // prefill from whatever is already on the application
  useEffect(() => {
    setForm((f) => ({
      ...f,
      website: app.website || "",
      product_link: app.product_link || "",
      github_profile: app.github_profile || "",
      num_users: app.num_users != null ? String(app.num_users) : "",
      current_revenue: app.current_revenue != null ? String(app.current_revenue) : "",
      team_info: app.team_info || "",
    }));
  }, [app.website, app.product_link, app.github_profile, app.num_users, app.current_revenue, app.team_info]);

  async function submit() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload: Record<string, unknown> = {};
      if (form.website.trim()) payload.website = form.website.trim();
      if (form.product_link.trim()) payload.product_link = form.product_link.trim();
      if (form.github_profile.trim()) payload.github_profile = form.github_profile.trim();
      if (form.num_users.trim()) payload.num_users = Number(form.num_users);
      if (form.current_revenue.trim()) payload.current_revenue = Number(form.current_revenue);
      if (form.team_info.trim()) payload.team_info = form.team_info.trim();
      if (form.customer_info.trim()) payload.customer_info = form.customer_info.trim();
      await api.patch<ApplicationDetail>(`/api/applications/${app.id}`, payload);
      setSaved(true);
      onSaved(); // refresh so the "still needs" list updates
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  const done = app.missing_fields.length === 0;

  const field = (k: keyof typeof form, label: string, ph = "", type = "text") => (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type={type}
        className="input mt-1"
        value={form[k]}
        placeholder={ph}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );

  return (
    <Section
      card={false}
      title="What Would Help the Fund Decide"
      subtitle={app.missing_fields.length ? `${app.missing_fields.length} Item${app.missing_fields.length === 1 ? "" : "s"} Outstanding — Fill In What You Can` : "Everything Requested Has Been Provided"}
    >
      {done && (
        <p className="mb-3 text-sm text-positive">You&rsquo;ve provided everything the fund asked for. You can still update details below.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {field("website", "Website", "https://…")}
        {field("product_link", "Product / Demo Link", "https://…")}
        {field("github_profile", "GitHub Username", "e.g. yourhandle")}
        {field("num_users", "Current Users", "e.g. 1200", "number")}
        {field("current_revenue", "Current Revenue ($)", "e.g. 5000", "number")}
        {field("customer_info", "Customer / Pilot Info", "e.g. 2 paid pilots")}
      </div>
      <label className="mt-3 block">
        <span className="label">Team</span>
        <textarea
          className="textarea mt-1"
          rows={2}
          placeholder="Founders, Roles, Relevant Background…"
          value={form.team_info}
          onChange={(e) => setForm({ ...form, team_info: e.target.value })}
        />
      </label>

      {error && <p className="field-error">{error}</p>}
      {saved && !error && <p className="animate-rise mt-3 flex items-center gap-1.5 text-sm text-positive" role="status"><CheckIcon size={14} className="check-draw" /> Saved — sent to the fund. Thank you!</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant={deckDone(app) ? "primary" : "secondary"} onClick={submit} busy={saving}>Submit to the Fund</Button>
        <span className="text-xs text-ink-muted">
          Adding a GitHub username lets the fund verify your work with real public activity.
        </span>
      </div>
    </Section>
  );
}

// the status page has one primary action: finishing the deck if it's missing,
// otherwise sending more details
function deckDone(app: ApplicationDetail): boolean {
  return !!app.document && app.document.status === "extracted";
}
