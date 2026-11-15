"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { humanStatus } from "@/lib/format";
import { Thesis } from "@/lib/types";
import Link from "next/link";
import { Badge, Drawer, EmptyState, ErrorState, PageHeader, Section, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { Tabs, tabPanelProps } from "@/components/Tabs";

const EMPTY = {
  fund_name: "", sectors: "", stages: "", geographies: "",
  min_check_size: 0, max_check_size: 0, target_ownership: 0, risk_tolerance: "balanced",
  traction_preferences: "", founder_preferences: "",
  excluded_sectors: "", excluded_geographies: "", excluded_business_models: "",
  custom_description: "",
};
type Form = typeof EMPTY;

function toList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function toForm(t: Thesis): Form {
  return {
    fund_name: t.fund_name,
    sectors: t.sectors.join(", "),
    stages: t.stages.join(", "),
    geographies: t.geographies.join(", "),
    min_check_size: t.min_check_size,
    max_check_size: t.max_check_size,
    target_ownership: t.target_ownership,
    risk_tolerance: t.risk_tolerance,
    traction_preferences: t.traction_preferences,
    founder_preferences: t.founder_preferences,
    excluded_sectors: t.excluded_sectors.join(", "),
    excluded_geographies: t.excluded_geographies.join(", "),
    excluded_business_models: t.excluded_business_models.join(", "),
    custom_description: t.custom_description,
  };
}

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;

export default function FundPage() {
  return (
    <Suspense fallback={<Spinner label="Loading fund…" />}>
      <Fund />
    </Suspense>
  );
}

function Fund() {
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [impact, setImpact] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // ?edit=1 opens the editor, so "Edit" links and refreshes land in the right place
  const editing = params.get("edit") === "1";
  const notify = useToast();
  const setEditing = useCallback(
    (open: boolean) => router.replace(open ? `${pathname}?edit=1` : pathname, { scroll: false }),
    [pathname, router]
  );

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api.get<{ thesis: Thesis | null }>("/api/thesis")
      .then((r) => setThesis(r.thesis))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load the fund"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const header = (
    <PageHeader
      title="Investment thesis"
      subtitle={thesis
        ? `${thesis.fund_name} · What we look for. Thesis fit scores and lead searches use it.`
        : "What your fund looks for. Thesis fit scores and lead searches use it."}
      actions={thesis && <button className="btn-primary" onClick={() => setEditing(true)}>Edit thesis</button>}
    />
  );

  return (
    // a reading width for the fund profile, even on wide screens
    <div className="max-w-[1280px] space-y-6">
      {header}
      {impact && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-positive/30 bg-positive-wash px-4 py-3 text-[15px] text-positive" role="status">
          <span><strong className="font-semibold">Thesis saved.</strong> {impact}</span>
          <span className="flex gap-2">
            <Link href="/vc/founders?source=open" className="btn-secondary btn-sm">Source founders</Link>
            <button className="btn-ghost btn-sm" onClick={() => setImpact(null)}>Dismiss</button>
          </span>
        </div>
      )}
      {loading ? <Spinner label="Loading fund…" /> : loadError ? <ErrorState message={loadError} onRetry={load} /> : thesis ? (
        <Profile t={thesis} />
      ) : (
        <EmptyState
          title="No investment thesis yet"
          hint="Start with your sectors, stages, and geographies. Trajectory uses them to score each company's thesis fit and to plan lead searches."
          action={<button className="btn-primary" onClick={() => setEditing(true)}>Create thesis</button>}
        />
      )}
      <ThesisEditor
        open={editing}
        existing={thesis}
        onClose={() => setEditing(false)}
        onSaved={(t, created) => {
          setThesis(t);
          setImpact(created
            ? "New leads and applications get a thesis fit score against it."
            : "New leads and applications are scored against these changes; existing fit scores update when a record is re-scored.");
          setEditing(false);
          notify({ message: created ? "Thesis created." : "Thesis saved." });
        }}
      />
    </div>
  );
}

function Profile({ t }: { t: Thesis }) {
  const weights = Object.entries(t.score_weights || {}).filter(([, w]) => typeof w === "number");
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
      <div className="space-y-6">
        <Section title="Investment focus" subtitle="Matches raise a company's thesis fit score">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Chips label="Sectors" items={t.sectors} />
            <Chips label="Stages" items={t.stages} />
            <Chips label="Geographies" items={t.geographies} />
          </dl>
          {t.custom_description && (
            <p className="mt-4 max-w-prose border-t border-line pt-4 text-[15px] leading-7 text-ink-soft">{t.custom_description}</p>
          )}
          <dl className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <Text label="Founders we look for" value={t.founder_preferences} />
            <Text label="Traction we look for" value={t.traction_preferences} />
          </dl>
        </Section>

        <Section title="Exclusions" subtitle="Companies that match any of these get a very low fit score (5–8 of 100)">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Chips label="Sectors" items={t.excluded_sectors} tone="bg-negative-wash text-negative" empty="None" />
            <Chips label="Geographies" items={t.excluded_geographies} tone="bg-negative-wash text-negative" empty="None" />
            <Chips label="Business models" items={t.excluded_business_models} tone="bg-negative-wash text-negative" empty="None" />
          </dl>
        </Section>
      </div>

      <div className="space-y-6">
        <Section title="Terms" subtitle="For your reference; not used in scoring">
          <dl className="divide-y divide-line text-[15px]">
            <Term label="Check size" value={t.min_check_size || t.max_check_size ? `${money(t.min_check_size)} – ${money(t.max_check_size)}` : "Not set"} />
            <Term label="Target ownership" value={t.target_ownership ? `${t.target_ownership}%` : "Not set"} />
            <Term label="Risk tolerance" value={humanStatus(t.risk_tolerance || "—")} />
            {t.updated_at && <Term label="Last updated" value={new Date(t.updated_at).toLocaleDateString()} />}
          </dl>
        </Section>
        {weights.length > 0 && (
          <Section title="Founder score weights" subtitle="How the Founder Score is composed">
            <ul className="space-y-2">
              {weights.map(([k, w]) => (
                <li key={k}>
                  <div className="flex justify-between text-[13px]"><span className="text-ink-soft">{humanStatus(k)}</span><span className="num text-ink-muted">{Math.round(Number(w) * 100)}%</span></div>
                  <div className="mt-1 h-1 rounded-full bg-line"><div className="h-1 rounded-full bg-brand" style={{ width: `${Math.min(100, Number(w) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function Chips({ label, items, tone, empty = "Any" }: { label: string; items: string[]; tone?: string; empty?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1.5 flex flex-wrap gap-1">
        {items.length ? items.map((s) => <Badge key={s} tone={tone}>{s}</Badge>) : <span className="text-sm text-ink-faint">{empty}</span>}
      </dd>
    </div>
  );
}

function Text({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-ink-soft">{value || <span className="text-ink-faint">Not specified</span>}</dd>
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="num text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

type Errors = Partial<Record<keyof Form, string>>;

// The editor's three sections share one draft and one Save button.
type ThesisSection = "focus" | "terms" | "exclusions";
const SECTIONS: { key: ThesisSection; label: string }[] = [
  { key: "focus", label: "Investment focus" },
  { key: "terms", label: "Terms" },
  { key: "exclusions", label: "Exclusions" },
];
// field order matches the on-screen order, so "first invalid field" means what you'd expect
const FIELD_SECTION: [keyof Form, ThesisSection][] = [
  ["fund_name", "focus"], ["sectors", "focus"], ["stages", "focus"], ["geographies", "focus"],
  ["risk_tolerance", "focus"], ["custom_description", "focus"], ["founder_preferences", "focus"], ["traction_preferences", "focus"],
  ["min_check_size", "terms"], ["max_check_size", "terms"], ["target_ownership", "terms"],
  ["excluded_sectors", "exclusions"], ["excluded_geographies", "exclusions"], ["excluded_business_models", "exclusions"],
];

function validate(f: Form): Errors {
  const e: Errors = {};
  const num = (v: number | string) => Number(v);
  if (!String(f.fund_name).trim()) e.fund_name = "Enter your fund's name.";
  if (num(f.min_check_size) < 0) e.min_check_size = "Can't be negative.";
  if (num(f.max_check_size) < 0) e.max_check_size = "Can't be negative.";
  if (num(f.min_check_size) > 0 && num(f.max_check_size) > 0 && num(f.min_check_size) > num(f.max_check_size))
    e.max_check_size = "Must be at least the minimum check.";
  if (num(f.target_ownership) < 0 || num(f.target_ownership) > 100) e.target_ownership = "Enter a percentage from 0 to 100.";
  return e;
}

function ThesisEditor({ open, existing, onClose, onSaved }: {
  open: boolean;
  existing: Thesis | null;
  onClose: () => void;
  onSaved: (t: Thesis, created: boolean) => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [section, setSection] = useState<ThesisSection>("focus");
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setForm(existing ? toForm(existing) : EMPTY); setError(null); setTried(false); setSection("focus"); }
  }, [open, existing]);
  // focus a field once its section is on screen
  useEffect(() => {
    if (!pendingFocus) return;
    document.getElementById(pendingFocus)?.focus();
    setPendingFocus(null);
  }, [pendingFocus, section]);
  const errors = validate(form);
  const shown: Errors = tried ? errors : {};
  const sectionErrors = (k: ThesisSection) => FIELD_SECTION.filter(([f, sec]) => sec === k && shown[f]).length;

  async function save() {
    setTried(true);
    const first = FIELD_SECTION.find(([f]) => errors[f]);
    if (first) {
      // open the section with the first field that needs attention, then focus it
      setSection(first[1]);
      setPendingFocus(`thesis-${first[0]}`);
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      fund_name: form.fund_name.trim(),
      sectors: toList(form.sectors), stages: toList(form.stages), geographies: toList(form.geographies),
      min_check_size: Number(form.min_check_size), max_check_size: Number(form.max_check_size),
      target_ownership: Number(form.target_ownership), risk_tolerance: form.risk_tolerance,
      traction_preferences: form.traction_preferences, founder_preferences: form.founder_preferences,
      excluded_sectors: toList(form.excluded_sectors), excluded_geographies: toList(form.excluded_geographies),
      excluded_business_models: toList(form.excluded_business_models), custom_description: form.custom_description,
    };
    try {
      const r = existing
        ? await api.put<{ thesis: Thesis }>(`/api/thesis/${existing.id}`, payload)
        : await api.post<{ thesis: Thesis }>("/api/thesis", payload);
      onSaved(r.thesis, !existing);
    } catch (e) {
      setError(e instanceof Error ? `Couldn't save the thesis: ${e.message}` : "Couldn't save the thesis.");
    } finally {
      setSaving(false);
    }
  }

  const field = (k: keyof Form, label: string, opts: { ph?: string; type?: string; hint?: string; required?: boolean; suffix?: string } = {}) => {
    const id = `thesis-${k}`;
    const err = shown[k];
    return (
      <div>
        <label htmlFor={id} className="label">
          {label}{opts.required && <span className="text-negative" aria-hidden> *</span>}
        </label>
        <input
          id={id}
          type={opts.type ?? "text"}
          inputMode={opts.type === "number" ? "decimal" : undefined}
          min={opts.type === "number" ? 0 : undefined}
          className={`input mt-1 ${err ? "border-negative focus:border-negative focus:ring-negative/15" : ""}`}
          value={form[k] as string | number}
          placeholder={opts.ph}
          required={opts.required}
          aria-invalid={!!err}
          aria-describedby={[opts.hint && `${id}-hint`, err && `${id}-error`].filter(Boolean).join(" ") || undefined}
          onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        />
        {err && <p id={`${id}-error`} className="mt-1 text-[13px] text-negative">{err}</p>}
        {opts.hint && <p id={`${id}-hint`} className="mt-1 text-[13px] text-ink-muted">{opts.hint}</p>}
      </div>
    );
  };

  const errorCount = Object.keys(shown).length;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={existing ? "Edit thesis" : "Create thesis"}
      subtitle="One draft across all three sections — switch freely, then save once. Separate lists with commas."
      footer={
        <>
          {errorCount > 0 && <span className="mr-auto text-[13px] text-negative" role="alert">Fix {errorCount} {errorCount === 1 ? "field" : "fields"} to save.</span>}
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : existing ? "Save changes" : "Create thesis"}</button>
        </>
      }
    >
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        {error && <ErrorState message={error} onRetry={save} />}
        <Tabs
          label="Thesis sections"
          idPrefix="thesis"
          size="sm"
          value={section}
          onChange={setSection}
          tabs={SECTIONS.map((sec) => {
            const n = sectionErrors(sec.key);
            return { key: sec.key, label: sec.label, badge: n ? <span className="chip bg-negative-wash text-negative" aria-label={`${n} to fix`}>{n}</span> : undefined };
          })}
        />
        <div {...tabPanelProps("thesis", section)}>
        {section === "focus" && (
        <fieldset className="space-y-4">
          <legend className="sr-only">Investment focus</legend>
          <p className="text-[13px] text-ink-muted"><span className="text-negative">*</span> Required. Matches on sectors, stages, and geographies raise a company&apos;s thesis fit.</p>
          {field("fund_name", "Fund name", { ph: "Northstar Ventures", required: true })}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("sectors", "Sectors", { ph: "fintech, ai/ml, devtools", hint: "A matching sector adds the most to thesis fit. Also used to plan lead searches." })}
            {field("stages", "Stages", { ph: "pre-seed, seed", hint: "Matching stage adds to thesis fit." })}
            {field("geographies", "Geographies", { ph: "Boston, San Francisco", hint: "Matching location adds to thesis fit." })}
            <div>
              <label htmlFor="thesis-risk" className="label">Risk tolerance</label>
              <select id="thesis-risk" className="select mt-1" value={form.risk_tolerance} aria-describedby="thesis-risk-hint" onChange={(e) => setForm({ ...form, risk_tolerance: e.target.value })}>
                {["conservative", "balanced", "aggressive"].map((r) => <option key={r} value={r}>{humanStatus(r)}</option>)}
                {!["conservative", "balanced", "aggressive"].includes(form.risk_tolerance) && <option value={form.risk_tolerance}>{form.risk_tolerance}</option>}
              </select>
              <p id="thesis-risk-hint" className="mt-1 text-[13px] text-ink-muted">Given to AI analysis when it weighs risks. Doesn&apos;t change fit scores.</p>
            </div>
          </div>
          <div>
            <label htmlFor="thesis-description" className="label">Thesis in a sentence or two</label>
            <textarea id="thesis-description" className="textarea mt-1" rows={3} value={form.custom_description} aria-describedby="thesis-description-hint"
              placeholder="We back technical pre-seed founders building financial infrastructure."
              onChange={(e) => setForm({ ...form, custom_description: e.target.value })} />
            <p id="thesis-description-hint" className="mt-1 text-[13px] text-ink-muted">Used to plan web searches and as context for AI analysis.</p>
          </div>
          {field("founder_preferences", "Founders we look for", { ph: "Technical founders with repeated execution", hint: "Used to plan lead searches." })}
          {field("traction_preferences", "Traction we look for", { ph: "Evidence of product adoption", hint: "Shown on your fund profile." })}
        </fieldset>
        )}
        {section === "terms" && (
        <fieldset className="space-y-4">
          <legend className="sr-only">Terms</legend>
          <p className="text-[13px] text-ink-muted">For your reference on the fund profile; not used in scoring.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {field("min_check_size", "Min check ($)", { ph: "250000", type: "number" })}
            {field("max_check_size", "Max check ($)", { ph: "1500000", type: "number" })}
            {field("target_ownership", "Target ownership (%)", { ph: "8", type: "number" })}
          </div>
        </fieldset>
        )}
        {section === "exclusions" && (
        <fieldset className="space-y-4">
          <legend className="sr-only">Exclusions</legend>
          <p className="text-[13px] text-ink-muted">A company matching any exclusion gets a fit score of 5–8 out of 100, whatever else matches. Separate entries with commas.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {field("excluded_sectors", "Sectors", { ph: "gambling" })}
            {field("excluded_geographies", "Geographies")}
            {field("excluded_business_models", "Business models", { ph: "services agency" })}
          </div>
        </fieldset>
        )}
        </div>
        {/* lets Enter in a field submit the form */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Drawer>
  );
}
