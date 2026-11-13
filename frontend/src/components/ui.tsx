"use client";

import Link from "next/link";
import { ReactNode, useEffect, useId, useRef } from "react";
import { scoreTone } from "@/lib/format";
import { CloseIcon } from "./icons";

export function Badge({ children, tone = "bg-neutral-wash text-neutral", title }: { children: ReactNode; tone?: string; title?: string }) {
  return <span className={`chip ${tone}`} title={title}>{children}</span>;
}

export function DemoBadge() {
  return <Badge tone="bg-neutral-wash text-ink-muted" title="Fictional demo data">Demo data</Badge>;
}

// Page-level hierarchy: one title, an optional one-line purpose, actions on the right.
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-3xl text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// A bordered panel with a thin header row. `flush` removes body padding (tables).
export function Section({
  title, subtitle, children, right, id, flush = false, className = "",
}: {
  title: ReactNode; subtitle?: ReactNode; children: ReactNode; right?: ReactNode; id?: string; flush?: boolean; className?: string;
}) {
  return (
    <section className={`card ${className}`} id={id} aria-label={typeof title === "string" ? title : undefined}>
      <div className="panel-header">
        <div className="min-w-0">
          <h2 className="panel-title">{title}</h2>
          {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

// Filter / action row above a table.
export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; href?: string }) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className={`num mt-1 text-2xl font-semibold leading-none ${tone || "text-ink"}`}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-ink-muted">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border border-line bg-white px-4 py-3 transition-colors hover:border-ink-faint">{body}</Link>
  ) : (
    <div className="rounded-lg border border-line bg-white px-4 py-3">{body}</div>
  );
}

export function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pctv = Math.max(0, Math.min(100, score)) / 100;
  const stroke = score >= 70 ? "#067647" : score >= 50 ? "#1f4fd8" : score >= 35 ? "#b54708" : "#b42318";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${Math.round(score)} of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eceef2" strokeWidth={5} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth={5}
        strokeDasharray={c} strokeDashoffset={c * (1 - pctv)} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-ink" fontSize={size * 0.3} fontWeight={600}>
        {Math.round(score)}
      </text>
    </svg>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" title={`Confidence ${Math.round(value * 100)}%`}>
      <div className="h-1 w-20 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="num text-xs text-ink-muted">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-muted">{hint}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-negative/25 bg-negative-wash px-4 py-3 text-[13px] text-negative" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn-secondary btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-ink-muted" role="status">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />
      {label}
    </div>
  );
}

export function ScoreText({ score }: { score: number }) {
  return <span className={`num font-semibold ${scoreTone(score)}`}>{Math.round(score)}</span>;
}

export function LinkButton({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost" }) {
  const cls = variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : "btn-secondary";
  return <Link href={href} className={cls}>{children}</Link>;
}

export function Tooltip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}

// Compact segmented control used for filters and view switches.
export function Segmented<T extends string>({ label, value, options, onChange, size = "md" }: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-md border border-line-strong bg-white p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`num whitespace-nowrap rounded-[4px] font-medium transition-colors ${size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]"} ${
            value === o.value ? "bg-ink text-white" : "text-ink-soft hover:bg-neutral-wash hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Right-side drawer (full-width sheet on phones). Escape and the backdrop close
// it; focus moves into the drawer on open and returns to the opener on close.
export function Drawer({
  open, onClose, title, subtitle, children, footer, width = "max-w-xl",
}: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const first = panel?.querySelector<HTMLElement>("input, textarea, select, button:not([data-drawer-close]), a[href]");
    (first ?? panel)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel) return;
      // keep Tab inside the drawer
      const items = [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex='-1'])")];
      if (!items.length) return;
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex h-full w-full ${width} flex-col border-l border-line bg-white shadow-overlay focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn -mr-1.5" onClick={onClose} aria-label="Close" data-drawer-close>
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
