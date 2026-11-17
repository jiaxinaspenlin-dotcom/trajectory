"use client";

import Link from "next/link";
import { ButtonHTMLAttributes, CSSProperties, ElementType, ReactNode, useEffect, useId, useRef, useState } from "react";
import { asSentence, scoreTone } from "@/lib/format";
import { useCountUp, useIndicator, usePresence, useReveal, useSeen } from "@/lib/motion";
import { CheckIcon, CloseIcon } from "./icons";

export function Badge({ children, tone = "bg-neutral-wash text-neutral", title }: { children: ReactNode; tone?: string; title?: string }) {
  return <span className={`chip ${tone}`} title={title}>{children}</span>;
}

export function DemoBadge() {
  return <Badge tone="bg-neutral-wash text-ink-muted" title="Fictional Demo Data">Demo Data</Badge>;
}

// Page-level hierarchy: one title, an optional one-line purpose, actions on the
// right (on phones they wrap under the title). At most one action is primary.
// Once the title scrolls away, a condensed bar with the title and the actions
// stays pinned to the top with a hairline.
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // the shell's phone bar covers the top 56px; the condensed bar sits below it
    const io = new IntersectionObserver(([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top < 0), {
      rootMargin: `-${window.innerWidth >= 1024 ? 0 : 56}px 0px 0px 0px`,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <div className="sticky top-14 z-30 !m-0 -mx-4 h-0 sm:-mx-6 lg:top-0 lg:-mx-10" aria-hidden={!pinned} {...((!pinned ? { inert: "" } : {}) as object)}>
        <div
          className={`flex h-14 items-center justify-between gap-4 border-b border-line bg-white/90 px-4 backdrop-blur-md transition-[opacity,transform] duration-base ease-out sm:px-6 lg:px-10 ${
            pinned ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"}`}
          data-condensed-header
        >
          <p className="truncate text-section text-ink">{title}</p>
          {actions && <div className="hidden shrink-0 items-center gap-2 sm:flex">{actions}</div>}
        </div>
      </div>
      <div ref={ref} className="animate-rise !mt-0 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
          <h1 className="text-[1.625rem] font-[650] leading-8 tracking-[-0.025em] text-ink sm:text-page">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-3xl text-body text-ink-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </>
  );
}

// A block that fades and rises into view the first time it is scrolled to.
// `i` staggers siblings slightly.
export function Reveal<T extends ElementType = "div">({ as, i = 0, className = "", children, ...rest }: {
  as?: T; i?: number; className?: string; children: ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">) {
  const ref = useReveal<HTMLElement>();
  const Tag = (as ?? "div") as ElementType;
  return <Tag ref={ref} className={className} style={{ "--i": i } as CSSProperties} {...rest}>{children}</Tag>;
}

// A titled group. Plain by default: the title, then the content, separated from
// the next group by space. `card` frames it (lists and tables that need an edge).
export function Section({
  title, subtitle, children, right, id, flush = false, card = true, className = "",
}: {
  title: ReactNode; subtitle?: ReactNode; children: ReactNode; right?: ReactNode; id?: string; flush?: boolean; card?: boolean; className?: string;
}) {
  const ref = useReveal<HTMLElement>();
  const titleId = useId();
  if (!card) {
    return (
      <section ref={ref} className={className} id={id} aria-labelledby={titleId}>
        <div className="mb-3 flex min-h-8 flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <h2 id={titleId} className="text-title text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-meta text-ink-muted">{subtitle}</p>}
          </div>
          {right}
        </div>
        {children}
      </section>
    );
  }
  return (
    <section ref={ref} className={`card ${className}`} id={id} aria-labelledby={titleId}>
      <div className={`panel-header ${flush ? "panel-header-divided" : ""}`}>
        <div className="min-w-0">
          <h2 id={titleId} className="panel-title">{title}</h2>
          {subtitle && <p className="text-meta text-ink-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className={flush ? "" : "px-5 pb-5 pt-1"}>{children}</div>
    </section>
  );
}

// Filter / action row above a table.
export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-3 ${className}`}>{children}</div>;
}

// A number that counts up the first time it's on screen.
export function CountUp({ value, format = (v) => String(Math.round(v)), className = "" }: { value: number; format?: (v: number) => string; className?: string }) {
  const [ref, shown] = useCountUp(value);
  return (
    <span ref={ref} className={`num ${className}`}>
      {/* the final value for screen readers; the animated one is decoration */}
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden>{format(shown)}</span>
    </span>
  );
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; href?: string }) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className={`num mt-1.5 text-[28px] font-semibold leading-none ${tone || "text-ink"}`}>{typeof value === "number" ? <CountUp value={value} /> : value}</div>
      {sub && <div className="mt-2 text-[13px] text-ink-muted">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card-interactive block rounded-xl border border-line bg-white px-5 py-4">{body}</Link>
  ) : (
    <div className="rounded-xl bg-surface-sunken px-5 py-4">{body}</div>
  );
}

export function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pctv = Math.max(0, Math.min(100, score)) / 100;
  const stroke = score >= 70 ? "#0e7a4f" : score >= 50 ? "#3047e8" : score >= 35 ? "#b54708" : "#b42318";
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

// A thin bar that fills (scaleX) the first time it is seen.
export function Meter({ value, className = "bg-brand", track = "bg-line", label }: { value: number; className?: string; track?: string; label?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const v = Math.max(0, Math.min(1, value));
  return (
    <div ref={ref} className={`h-1 overflow-hidden rounded-full ${track}`} role={label ? "img" : undefined} aria-label={label}>
      <div className={`h-full w-full origin-left rounded-full transition-transform duration-[600ms] ease-out ${className}`} style={{ transform: `scaleX(${seen ? v : 0})` }} />
    </div>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" title={`Confidence ${Math.round(value * 100)}%`}>
      <div className="w-20"><Meter value={value} /></div>
      <span className="num text-xs text-ink-muted">{Math.round(value * 100)}%</span>
    </div>
  );
}

// What's missing, why it matters, and the one thing to do about it.
export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="animate-rise rounded-2xl bg-surface-sunken px-6 py-14 text-center">
      {icon && <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-white text-brand shadow-card">{icon}</div>}
      <p className="text-title text-ink">{title}</p>
      {hint && <p className="mx-auto mt-2 max-w-md text-body text-ink-muted">{hint}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

// Error messages are sentences; API details ("Internal Server Error") get their period.
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="animate-rise flex flex-wrap items-center justify-between gap-3 rounded-xl border border-negative/20 bg-negative-wash px-4 py-3 text-sm text-negative" role="alert">
      <span>{asSentence(message)}</span>
      {onRetry && <button className="btn-secondary btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  );
}

// A small inline busy indicator for places that can't show a skeleton.
export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-muted" role="status">
      <span className="spinner h-3.5 w-3.5 text-brand" aria-hidden />
      {label}
    </div>
  );
}

// ---- skeletons: shaped like the content, so nothing jumps when data arrives
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton block ${className}`} aria-hidden />;
}

export function SkeletonRows({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`divide-y divide-line ${className}`} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 py-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="hidden h-8 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}

// A whole page loading: the header, then rows. `label` is announced.
export function PageSkeleton({ label, rows = 6, children }: { label: string; rows?: number; children?: ReactNode }) {
  return (
    <div role="status" aria-label={label} className="space-y-8">
      <span className="sr-only">{label}</span>
      <div className="space-y-3" aria-hidden>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {children ?? <SkeletonRows rows={rows} />}
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

// A button with an in-place busy state (keeps its width) and a short success
// confirmation: a check that draws in next to the done label.
export function Button({ variant = "secondary", size, busy = false, done = false, doneLabel = "Saved", children, className = "", ...rest }: {
  variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "lg"; busy?: boolean; done?: boolean; doneLabel?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = `btn-${variant} ${size ? `btn-${size}` : ""} ${className}`;
  return (
    <button type="button" className={cls} aria-busy={busy || undefined} {...rest}>
      {/* the label keeps its space while busy or done, so the button never resizes */}
      <span className={`inline-flex items-center gap-2 transition-opacity duration-fast ${busy || done ? "opacity-0" : ""}`}>{children}</span>
      {busy && <span className="absolute inset-0 grid place-items-center"><span className="spinner" aria-hidden /><span className="sr-only">Working…</span></span>}
      {done && !busy && (
        <span className="absolute inset-0 flex items-center justify-center gap-1.5" role="status">
          <CheckIcon size={16} className="check-draw" /> {doneLabel}
        </span>
      )}
    </button>
  );
}

export function Tooltip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white opacity-0 transition-[opacity,transform] duration-fast ease-out group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

// Compact segmented control used for filters and view switches. The selected
// option is marked by a pill that slides between options.
export function Segmented<T extends string>({ label, value, options, onChange, size = "md" }: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useIndicator(ref, "[aria-pressed='true']", [value, options.length]);
  return (
    // scrolls inside itself rather than widening the page on phones
    <div ref={ref} className="relative inline-flex max-w-full overflow-x-auto rounded-lg bg-neutral-wash p-0.5" role="group" aria-label={label}>
      {box && (
        <span
          aria-hidden
          className="absolute left-0 top-0 rounded-md bg-white shadow-card transition-transform duration-base ease-out"
          // real width (so the rounded corners stay round); only the position animates
          style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`press num relative whitespace-nowrap rounded-md font-medium transition-colors duration-fast ${size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-2 text-sm sm:px-3.5"} ${
            value === o.value ? `text-ink ${box ? "" : "bg-white shadow-card"}` : "text-ink-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Right-side drawer (a full-width sheet on phones). Slides in from the edge and
// back out; Escape and the backdrop close it; focus moves in on open and returns
// to the opener on close.
export function Drawer({
  open, onClose, title, subtitle, children, footer, width = "max-w-xl",
}: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { mounted, state } = usePresence(open, 220);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    // a form field first (ready to type), else the first control
    const first = panel?.querySelector<HTMLElement>("input, textarea, select") ?? panel?.querySelector<HTMLElement>("button:not([data-drawer-close]), a[href]");
    (first ?? panel)?.focus({ preventScroll: true });
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
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return (
    // !m-0: parents often use space-y-*, whose margin would offset this fixed overlay
    <div className="fixed inset-0 z-50 !m-0 flex justify-end">
      <div className={`absolute inset-0 bg-ink/25 scrim-${state}`} onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`drawer-${state} relative flex h-full w-full ${width} flex-col bg-white shadow-overlay focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-title text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close" data-drawer-close>
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">{footer}</div>}
      </div>
    </div>
  );
}
