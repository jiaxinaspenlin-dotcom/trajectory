"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { humanStatus, trajectoryTone } from "@/lib/format";
import { PipelineStatus } from "@/lib/myWorkspace";
import { inPipeline, leadStatus, shortlistOf } from "@/lib/pipeline";
import { FounderLead } from "@/lib/types";
import { ShortlistBadge, StageBadge } from "./DealBadges";
import { MoreIcon, SortIcon } from "./icons";
import { Badge } from "./ui";

const STATUS_OPTIONS: { value: PipelineStatus; label: string }[] = [
  { value: "saved", label: "Saved" },
  { value: "monitoring", label: "Monitoring" },
  { value: "dismissed", label: "Dismissed" },
];

export type FounderSortKey = "founder" | "company" | "score" | "momentum" | "evidence" | "status";
type Sort = { key: FounderSortKey; dir: "asc" | "desc" } | null;

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function sortValue(l: FounderLead, key: FounderSortKey, overlay: Record<number, PipelineStatus>): string | number {
  switch (key) {
    case "founder": return (l.founder?.full_name || l.company?.name || "").toLowerCase();
    case "company": return (l.company?.name || l.top_project?.name || "~").toLowerCase();
    case "score": return l.founder_score?.score ?? -1;
    case "momentum": return l.momentum?.change_30d ?? -1e9;
    case "evidence": return l.evidence_count;
    case "status": return `${inPipeline(l) ? 0 : 1}${leadStatus(l, overlay[l.id] ?? null)}`;
  }
}

export function sortFounderLeads(leads: FounderLead[], sort: Sort, overlay: Record<number, PipelineStatus>): FounderLead[] {
  if (!sort) return leads;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...leads].sort((a, b) => {
    const va = sortValue(a, sort.key, overlay);
    const vb = sortValue(b, sort.key, overlay);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
  });
}

// How much room the table has decides where secondary actions live:
// wide — every action inline; compact — Review inline, the rest in a row menu;
// stacked — one card per row (phones). Measured on the table's own container.
export type FoundersLayout = "wide" | "compact" | "stacked";
const COMPACT_BELOW = 1240;
const STACKED_BELOW = 720;

function useContainerLayout(forced?: FoundersLayout) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<FoundersLayout>(forced ?? "wide");
  useLayoutEffect(() => {
    if (forced || !ref.current || typeof ResizeObserver === "undefined") return;
    const el = ref.current;
    const apply = () => {
      const w = el.clientWidth;
      if (!w) return; // not laid out (e.g. hidden or a test DOM): keep the current layout
      setLayout(w < STACKED_BELOW ? "stacked" : w < COMPACT_BELOW ? "compact" : "wide");
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [forced]);
  return { ref, layout: forced ?? layout };
}

export function FoundersTable({
  leads,
  overlay,
  onSetStatus,
  onMoveToScreening,
  layout: forcedLayout,
}: {
  leads: FounderLead[];
  overlay: Record<number, PipelineStatus>;
  onSetStatus: (id: number, status: PipelineStatus | null) => void;
  // investor-approved transition into Screening (shared, on the same opportunity ID)
  onMoveToScreening: (id: number) => Promise<void>;
  layout?: FoundersLayout;
}) {
  const router = useRouter();
  const { ref, layout } = useContainerLayout(forcedLayout);
  const [sort, setSort] = useState<Sort>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  async function confirmMove(id: number) {
    setBusy(id);
    setRowError(null);
    try {
      await onMoveToScreening(id);
      setConfirming(null);
    } catch (e) {
      setRowError({ id, message: e instanceof Error ? e.message : "Could not move to screening." });
    } finally {
      setBusy(null);
    }
  }

  function toggleSort(key: FounderSortKey) {
    // numeric columns start high-to-low; text columns A–Z; third click clears
    const first = key === "founder" || key === "company" || key === "status" ? "asc" : "desc";
    setSort((s) => (s?.key !== key ? { key, dir: first } : s.dir === first ? { key, dir: first === "asc" ? "desc" : "asc" } : null));
  }

  const Th = ({ k, children, className = "", title }: { k: FounderSortKey; children: React.ReactNode; className?: string; title?: string }) => {
    const dir = sort?.key === k ? sort.dir : null;
    return (
      <th scope="col" className={className} title={title} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}>
        <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase hover:text-ink">
          {children}<SortIcon dir={dir} />
        </button>
      </th>
    );
  };

  const rows = sortFounderLeads(leads, sort, overlay);
  const name = (l: FounderLead) => l.founder?.full_name || l.company?.name || `Opportunity #${l.id}`;

  // Secondary actions for the row menu (compact and stacked layouts).
  // Always in this order: open the record, the stage step, then my shortlist.
  const menuItems = (l: FounderLead): RowMenuItem[] => [
    { label: "Open record", href: `/vc/opportunities/${l.id}` },
    inPipeline(l)
      ? { label: `View in Pipeline · ${humanStatus(l.stage)}`, href: `/vc/pipeline?stage=${l.stage}` }
      : {
          label: "Move to Screening…",
          confirm: {
            title: `Move ${name(l)} to Screening?`,
            body: "Moves this lead into the fund's Pipeline at Screening. No outreach is sent.",
            action: "Confirm move",
            run: () => confirmMove(l.id),
          },
        },
    { separator: true, label: "My shortlist" },
    ...STATUS_OPTIONS.map((o) => ({
      label: o.label,
      checked: overlay[l.id] === o.value,
      onSelect: () => onSetStatus(l.id, overlay[l.id] === o.value ? null : o.value),
    })),
    ...(overlay[l.id] ? [{ label: "Remove from shortlist", onSelect: () => onSetStatus(l.id, null) }] : []),
  ];

  const statusSelect = (l: FounderLead) => (
    <select
      aria-label={`My shortlist for ${name(l)}`}
      className="mt-1 h-7 max-w-full rounded border border-line bg-white px-1 text-xs text-ink-soft"
      value={overlay[l.id] ?? ""}
      onChange={(e) => onSetStatus(l.id, (e.target.value || null) as PipelineStatus | null)}
    >
      {/* the blank option is an action, not a value: the badge above shows the current status */}
      <option value="">{overlay[l.id] ? "Remove from shortlist" : "Add to shortlist…"}</option>
      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const review = (l: FounderLead) => (
    <Link href={`/vc/opportunities/${l.id}`} onClick={stop} className="btn-secondary btn-sm" aria-label={`Review ${name(l)}`}>Review →</Link>
  );

  const errorLine = (l: FounderLead) =>
    rowError?.id === l.id && <p className="mt-1 text-xs text-negative" role="alert">{rowError.message}</p>;

  if (layout === "stacked") {
    return (
      <div ref={ref}>
        <ul className="card divide-y divide-line" aria-label="Founders">
          {rows.map((l) => (
            <li key={l.id} data-testid={`founder-row-${l.id}`} className="space-y-2.5 px-4 py-3.5">
              <div className="min-w-0">
                <FounderCell l={l} />
              </div>
              <CompanyCell l={l} />
              <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                <div className="flex items-center gap-1.5"><dt className="text-ink-muted">Score</dt><dd><ScoreCell l={l} /></dd></div>
                <div className="flex items-center gap-1.5"><dt className="text-ink-muted">Evidence</dt><dd className="num text-ink-soft">{l.evidence_count}</dd></div>
                <div className="flex items-center gap-1.5"><dd><MomentumCell l={l} /></dd></div>
              </dl>
              <div className="flex items-center justify-between gap-2">
                <StatusBadges l={l} shortlist={shortlistOf(l, overlay[l.id] ?? null)} />
                <span className="flex shrink-0 items-center gap-1.5">
                  {review(l)}
                  <RowMenu label={`More actions for ${name(l)}`} items={menuItems(l)} busy={busy === l.id} />
                </span>
              </div>
              {errorLine(l)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const compact = layout === "compact";
  return (
    // `relative` makes this the containing block for absolutely positioned
    // children (e.g. sr-only headers), so they scroll here instead of widening the page
    <div ref={ref} className="card relative overflow-x-auto">
      {/* tighter cells than the default table; the first and last keep the card's inset */}
      <table className="table [&_td]:px-3 [&_th]:px-3 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4">
        <thead>
          <tr>
            <Th k="founder" className="min-w-[11rem]">Founder</Th>
            <Th k="company">Company / project</Th>
            <Th k="score" className="text-right">Score</Th>
            <Th k="momentum">Momentum</Th>
            <Th k="evidence" className="text-right">Evidence</Th>
            <Th k="status" title="Shared stage, with your shortlist (if any) underneath">Stage</Th>
            <th scope="col" className="text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const href = `/vc/opportunities/${l.id}`;
            const shortlist = shortlistOf(l, overlay[l.id] ?? null);
            return (
              <tr key={l.id} data-testid={`founder-row-${l.id}`} onClick={() => router.push(href)} className="table-row-link">
                <td className="max-w-[16rem]"><FounderCell l={l} /></td>
                <td className="max-w-[15rem]"><CompanyCell l={l} /></td>
                <td className="text-right"><ScoreCell l={l} /></td>
                <td className="min-w-[8.5rem]"><MomentumCell l={l} /></td>
                <td className="text-right">
                  {l.evidence_count
                    ? <span className="num text-ink-soft">{l.evidence_count}</span>
                    : <span className="text-xs text-ink-muted">None yet</span>}
                </td>
                <td onClick={stop}>
                  <StatusBadges l={l} shortlist={shortlist} stacked />
                  {!compact && statusSelect(l)}
                </td>
                <td className="text-right" onClick={stop}>
                  <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    {compact ? (
                      <RowMenu label={`More actions for ${name(l)}`} items={menuItems(l)} busy={busy === l.id} />
                    ) : inPipeline(l) ? (
                      <Link href={`/vc/pipeline?stage=${l.stage}`} className="btn-ghost btn-sm">View in Pipeline</Link>
                    ) : confirming === l.id ? (
                      <>
                        <button className="btn-primary btn-sm" onClick={() => confirmMove(l.id)} disabled={busy === l.id}>
                          {busy === l.id ? "Moving…" : "Confirm move"}
                        </button>
                        <button className="btn-ghost btn-sm" onClick={() => setConfirming(null)} disabled={busy === l.id}>Cancel</button>
                      </>
                    ) : (
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => { setConfirming(l.id); setRowError(null); }}
                        title="Approve moving this founder into Screening. Nothing is sent to the founder."
                      >
                        Move to Screening
                      </button>
                    )}
                    {review(l)}
                  </div>
                  {!compact && confirming === l.id && (
                    <p className="mt-1 whitespace-normal text-xs text-ink-muted">Moves this lead into the fund&apos;s Pipeline at Screening. No outreach is sent.</p>
                  )}
                  {errorLine(l)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FounderCell({ l }: { l: FounderLead }) {
  const href = `/vc/opportunities/${l.id}`;
  return (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        <Link href={href} onClick={stop} className="break-words font-medium text-ink hover:text-brand">
          {l.founder?.full_name || l.company?.name || `Opportunity #${l.id}`}
        </Link>
        {!!l.new_evidence_count && (
          <Link
            href={`${href}#evidence`}
            onClick={stop}
            data-testid={`new-evidence-${l.id}`}
            title="Web evidence found since you last reviewed this lead"
            className="chip bg-signal-wash text-caution hover:ring-1 hover:ring-signal"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />
            New evidence · {l.new_evidence_count}
          </Link>
        )}
      </span>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-muted [&_a]:max-w-full [&_a]:truncate">
        {l.founder?.github_username && (
          <a href={`https://github.com/${l.founder.github_username}`} target="_blank" rel="noreferrer" onClick={stop} className="hover:text-brand">
            @{l.founder.github_username} ↗
          </a>
        )}
        {l.founder?.location && <span>{l.founder.location}</span>}
        {!l.founder && (l.identity?.founder_named ? (
          <span title="Named on a retrieved page; not matched to a verified profile">
            Named on source: {l.identity.founder_named} · unverified
          </span>
        ) : <span>Founder not linked yet</span>)}
        {!l.founder && l.company?.website && (
          <a href={l.company.website} target="_blank" rel="noreferrer" onClick={stop} className="hover:text-brand">
            {l.company.website.replace(/^https?:\/\/(www\.)?/, "")} ↗
          </a>
        )}
      </div>
    </>
  );
}

function CompanyCell({ l }: { l: FounderLead }) {
  if (l.company) {
    return (
      <div className="min-w-0">
        <p className="truncate text-ink">{l.company.name}</p>
        {l.company.one_liner && <p className="truncate text-xs text-ink-muted">{l.company.one_liner}</p>}
      </div>
    );
  }
  if (l.top_project) {
    return (
      <div className="min-w-0">
        <p className="text-xs text-ink-muted">No company yet · top project</p>
        <span className="flex min-w-0 items-center gap-1.5">
          {l.top_project.url ? (
            <a href={l.top_project.url} target="_blank" rel="noreferrer" onClick={stop} className="truncate text-brand hover:underline">{l.top_project.name} ↗</a>
          ) : <span className="truncate text-ink">{l.top_project.name}</span>}
          {l.top_project.stars != null && (
            <span className="num shrink-0 text-xs text-ink-muted" title="External interest only, not traction">★ {l.top_project.stars}</span>
          )}
        </span>
      </div>
    );
  }
  return <p className="text-xs text-ink-muted">No company yet</p>;
}

function ScoreCell({ l }: { l: FounderLead }) {
  return l.founder_score ? (
    <span className="num font-semibold text-ink" title={`Confidence ${Math.round(l.founder_score.confidence * 100)}%`}>
      {Math.round(l.founder_score.score)}
    </span>
  ) : <span className="text-xs text-ink-muted">Not scored</span>;
}

function MomentumCell({ l }: { l: FounderLead }) {
  const m = l.momentum;
  if (!m) return <span className="text-xs text-ink-muted">No history</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <Badge tone={trajectoryTone(m.trajectory)}>{humanStatus(m.trajectory)}</Badge>
      {m.change_30d != null && (
        <span className={`num text-xs ${m.change_30d >= 0 ? "text-positive" : "text-negative"}`}>
          {m.change_30d >= 0 ? "+" : ""}{Math.round(m.change_30d)} / 30d
        </span>
      )}
    </span>
  );
}

// Shared stage first (Sourcing → Screening → …), then my shortlist if any.
function StatusBadges({ l, shortlist, stacked = false }: { l: FounderLead; shortlist: ReturnType<typeof shortlistOf>; stacked?: boolean }) {
  return (
    <div className={stacked ? "flex flex-col items-start gap-1" : "flex flex-wrap items-center gap-1"}>
      <StageBadge stage={l.stage} />
      {shortlist && <ShortlistBadge shortlist={shortlist} />}
    </div>
  );
}

type RowMenuItem =
  | { separator: true; label: string }
  | {
      separator?: false;
      label: string;
      href?: string;
      checked?: boolean;
      onSelect?: () => void;
      confirm?: { title: string; body: string; action: string; run: () => Promise<void> };
    };

// Row actions that don't fit inline. Positioned against the viewport so the
// table's scroll container never clips it; closes on Escape, outside click, or scroll.
function RowMenu({ label, items, busy }: { label: string; items: RowMenuItem[]; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Extract<RowMenuItem, { separator?: false }>["confirm"] | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((refocus = false) => {
    setOpen(false);
    setPos(null);
    setConfirm(null);
    if (refocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const r = button.current!.getBoundingClientRect();
    const height = 260;
    const below = r.bottom + 6 + height < window.innerHeight;
    setPos({ top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - height), right: Math.max(8, window.innerWidth - r.right) });
    const onDoc = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const els = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem], [role=menuitemcheckbox]") ?? [])];
        const i = els.indexOf(document.activeElement as HTMLElement);
        els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
        e.preventDefault();
      }
    };
    const onScroll = () => close();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, close]);

  // focus the first item once the menu is on screen (it renders after its position is known)
  const shown = open && pos !== null;
  useEffect(() => {
    if (shown) menu.current?.querySelector<HTMLElement>("[role=menuitem], [role=menuitemcheckbox], button")?.focus();
  }, [shown, confirm]);

  const itemClass = "flex min-h-9 w-full items-center gap-2 rounded px-3 text-left text-sm text-ink-soft hover:bg-surface-sunken hover:text-ink focus:bg-surface-sunken focus:outline-none";

  return (
    <>
      <button
        ref={button}
        type="button"
        className="icon-btn h-8 w-8 border border-line-strong bg-white"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); setConfirm(null); }}
        disabled={busy}
      >
        <MoreIcon size={16} />
      </button>
      {open && pos && (
        <div
          ref={menu}
          id={id}
          role={confirm ? "dialog" : "menu"}
          aria-label={confirm ? confirm.title : label}
          onClick={stop}
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 w-64 rounded-lg border border-line bg-white p-1.5 text-left shadow-overlay"
        >
          {confirm ? (
            <div className="space-y-2 p-2">
              <p className="whitespace-normal text-sm font-medium text-ink">{confirm.title}</p>
              <p className="whitespace-normal text-[13px] text-ink-muted">{confirm.body}</p>
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-primary btn-sm" onClick={async () => { await confirm.run(); close(true); }}>
                  {busy ? "Moving…" : confirm.action}
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirm(null)}>Cancel</button>
              </div>
            </div>
          ) : items.map((it, i) =>
            it.separator ? (
              <p key={i} className="mt-1 border-t border-line px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">{it.label}</p>
            ) : it.href ? (
              <Link key={i} href={it.href} role="menuitem" className={itemClass} onClick={() => close()}>{it.label}</Link>
            ) : (
              <button
                key={i}
                type="button"
                role={it.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
                aria-checked={it.checked}
                className={itemClass}
                onClick={() => {
                  if (it.confirm) setConfirm(it.confirm);
                  else { it.onSelect?.(); close(true); }
                }}
              >
                {it.checked !== undefined && <span className={`w-3 text-brand ${it.checked ? "" : "invisible"}`} aria-hidden>✓</span>}
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </>
  );
}
