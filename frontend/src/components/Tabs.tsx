"use client";

import { KeyboardEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useIndicator, useIsoLayoutEffect } from "@/lib/motion";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

export interface TabItem<T extends string> {
  key: T;
  label: ReactNode;
  // short count or status shown after the label (e.g. "3" or an error dot)
  badge?: ReactNode;
}

// Accessible tabs (WAI-ARIA tabs pattern, automatic activation): one tab stop,
// Left/Right/Home/End move and select. The tab list scrolls inside itself on
// narrow screens instead of widening the page. Panels use `tabPanelProps`; give
// the panel `key={value}` so it cross-fades when the tab changes.
export function Tabs<T extends string>({
  label, tabs, value, onChange, idPrefix, size = "md",
}: {
  label: string;
  tabs: TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  idPrefix: string;
  size?: "md" | "sm";
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  // the active underline slides between tabs (transform only)
  const box = useIndicator(listRef, "[aria-selected='true']", [value, tabs.length]);
  // On a strip that scrolls sideways (phones), each side with tabs out of view
  // gets a fade. A fade reaches just far enough to cover a label cut by the edge
  // completely, its soft part over the empty space before that label, so no tab
  // ever shows half a word. 0 means no fade on that side.
  const [cover, setCover] = useState({ left: 0, right: 0 });
  const measure = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const sr = strip.getBoundingClientRect();
    let left = strip.scrollLeft > 1 ? FADE : 0;
    let right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1 ? FADE : 0;
    for (const [key, el] of Object.entries(refs.current)) {
      // placement keeps the selected tab clear; a fade never covers it
      const label = el && key !== valueRef.current ? labelBox(el) : null;
      if (!label) continue;
      // a label reaching into a fade (where the chevron sits) is covered whole
      if (right && label.left < sr.right && label.right > sr.right - FADE) right = Math.max(right, sr.right - label.left + FADE);
      if (left && label.right > sr.left && label.left < sr.left + FADE) left = Math.max(left, label.right - sr.left + FADE);
    }
    setCover((c) => (c.left === left && c.right === right ? c : { left, right }));
  }, []);

  // Keep the selected tab fully in view, clear of the fades, and stop the strip
  // where its edge falls in the empty space between two tabs, so no tab is cut
  // mid-word. When that stop lies past the natural end, the list gets just enough
  // trailing space to reach it. The first time it jumps; after that it slides.
  const placed = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const place = useCallback((smooth: boolean) => {
    const strip = stripRef.current;
    const list = listRef.current;
    const el = refs.current[valueRef.current];
    if (!strip || !list || !el) return;
    list.style.paddingRight = "";
    if (strip.scrollWidth <= strip.clientWidth) { measure(); return; }
    const pad = size === "sm" ? 12 : 14; // a tab's side padding: its label starts this far in
    const width = strip.clientWidth;
    const stops = [...list.querySelectorAll<HTMLElement>("[role=tab]")].map((t, i) => (i === 0 ? 0 : t.offsetLeft - pad));
    const fits = (at: number) => el.offsetLeft - at >= FADE - pad || at === 0;
    const clear = (at: number) => el.offsetLeft + el.offsetWidth - pad <= at + width - FADE;
    const ok = stops.filter((at) => fits(at) && clear(at));
    const at = ok.length ? ok.reduce((a, b) => (Math.abs(b - strip.scrollLeft) < Math.abs(a - strip.scrollLeft) ? b : a)) : Math.max(0, el.offsetLeft - pad);
    const max = strip.scrollWidth - width;
    if (at > max) list.style.paddingRight = `${at - max}px`;
    strip.scrollTo({ left: at, behavior: smooth ? "smooth" : "auto" });
    measure();
  }, [size, measure]);
  useIsoLayoutEffect(() => {
    place(placed.current);
    placed.current = true;
  }, [value, tabs.length, place]);
  // place again whenever a tab changes width (the web font arriving, a count
  // badge loading) or the strip does (the screen resizing). The list itself isn't
  // watched: placing changes its trailing space.
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => { if (live) place(false); });
    const strip = stripRef.current, list = listRef.current;
    if (!strip || !list || typeof ResizeObserver === "undefined") return () => { live = false; };
    const ro = new ResizeObserver(() => place(false));
    ro.observe(strip);
    list.querySelectorAll("[role=tab]").forEach((t) => ro.observe(t));
    return () => { live = false; ro.disconnect(); };
  }, [place, tabs.length]);

  // a chevron scrolls the strip most of its width that way
  function nudge(dir: 1 | -1) {
    const strip = stripRef.current;
    if (strip) strip.scrollBy({ left: dir * strip.clientWidth * 0.7, behavior: "smooth" });
  }

  function onKeyDown(e: KeyboardEvent) {
    const i = tabs.findIndex((t) => t.key === value);
    const to =
      e.key === "ArrowRight" ? (i + 1) % tabs.length
      : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].key);
    // the strip places the new tab itself (above), so focusing it doesn't scroll
    refs.current[tabs[to].key]?.focus({ preventScroll: true });
  }

  return (
    <div data-print-hide className="relative border-b border-line">
      {/* a fade on a side with tabs out of view: there is more that way */}
      {/* each fade carries a chevron at the edge: there are more tabs that way
          (clicking it scrolls there; keyboard users move with the arrow keys) */}
      {cover.left > 0 && (
        <span aria-hidden data-testid="tabs-fade-left" className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center"
          style={{ width: cover.left, background: `linear-gradient(to right, #fff calc(100% - ${FADE}px), rgba(255,255,255,0))` }}>
          <button type="button" tabIndex={-1} className="pointer-events-auto grid h-8 w-6 place-items-center text-ink-muted hover:text-ink" onClick={() => nudge(-1)}>
            <ChevronLeftIcon size={16} />
          </button>
        </span>
      )}
      {cover.right > 0 && (
        <span aria-hidden data-testid="tabs-fade-right" className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center justify-end"
          style={{ width: cover.right, background: `linear-gradient(to left, #fff calc(100% - ${FADE}px), rgba(255,255,255,0))` }}>
          <button type="button" tabIndex={-1} className="pointer-events-auto grid h-8 w-6 place-items-center text-ink-muted hover:text-ink" onClick={() => nudge(1)}>
            <ChevronRightIcon size={16} />
          </button>
        </span>
      )}
      <div ref={stripRef} onScroll={measure} className="max-w-full overflow-x-auto [scrollbar-width:none]">
      <div ref={listRef} role="tablist" aria-label={label} className="relative flex min-w-max gap-1" onKeyDown={onKeyDown}>
        {box && (
          <span
            aria-hidden
            className="absolute bottom-0 left-0 h-0.5 rounded-full bg-brand transition-transform duration-base ease-out"
            style={{ width: 1, transform: `translateX(${box.x}px) scaleX(${box.w})`, transformOrigin: "left" }}
          />
        )}
        {tabs.map((t) => {
          const selected = t.key === value;
          return (
            <button
              key={t.key}
              ref={(el) => { refs.current[t.key] = el; }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.key)}
              className={`press relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md font-medium transition-colors duration-fast focus-visible:outline-offset-[-2px] ${
                size === "sm" ? "h-10 px-3 text-sm" : "h-11 px-3.5 text-[15px]"} ${
                selected ? `text-ink ${box ? "" : "shadow-[inset_0_-2px_0_#3047e8]"}` : "text-ink-muted hover:bg-surface-sunken hover:text-ink"}`}
            >
              {t.label}
              {t.badge}
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// width of the soft part of the edge fades on a strip of tabs that scrolls sideways
const FADE = 24;

// where a tab's label (its text, not its padding) sits on screen
function labelBox(el: HTMLElement): DOMRect | null {
  const range = document.createRange();
  range.selectNodeContents(el);
  return typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
}

export function tabPanelProps(idPrefix: string, key: string) {
  return {
    role: "tabpanel" as const,
    id: `${idPrefix}-panel-${key}`,
    "aria-labelledby": `${idPrefix}-tab-${key}`,
    tabIndex: 0,
    className: "animate-fade focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-lg",
  };
}
