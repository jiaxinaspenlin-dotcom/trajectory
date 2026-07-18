import Link from "next/link";
import { ReactNode } from "react";
import { scoreTone } from "@/lib/format";

export function Badge({ children, tone = "bg-neutral-wash text-neutral", title }: { children: ReactNode; tone?: string; title?: string }) {
  return <span className={`chip ${tone}`} title={title}>{children}</span>;
}

export function DemoBadge() {
  return <Badge tone="bg-neutral-wash text-neutral" title="Fictional demo data">Demo data</Badge>;
}

export function Section({ title, subtitle, children, right, id }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <section className="card p-5" id={id}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-sunken p-3">
      <div className="label">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone || "text-ink"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

export function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const pctv = Math.max(0, Math.min(100, score)) / 100;
  const stroke = score >= 70 ? "#047857" : score >= 50 ? "#1e40af" : score >= 35 ? "#b45309" : "#b91c1c";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${Math.round(score)} of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth={6}
        strokeDasharray={c} strokeDashoffset={c * (1 - pctv)} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-ink" fontSize={size * 0.28} fontWeight={700}>
        {Math.round(score)}
      </text>
    </svg>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" title={`Confidence ${Math.round(value * 100)}%`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="text-xs text-ink-muted">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface-sunken p-8 text-center">
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-negative/30 bg-negative-wash p-4 text-sm text-negative" role="alert">
      {message}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-muted" role="status">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />
      {label}
    </div>
  );
}

export function ScoreText({ score }: { score: number }) {
  return <span className={`font-semibold ${scoreTone(score)}`}>{Math.round(score)}</span>;
}

export function LinkButton({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost" }) {
  const cls = variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : "btn-secondary";
  return <Link href={href} className={cls}>{children}</Link>;
}

export function Tooltip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}
