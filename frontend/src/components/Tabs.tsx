"use client";

import { KeyboardEvent, ReactNode, useEffect, useRef } from "react";
import { useIndicator } from "@/lib/motion";

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
  // the active underline slides between tabs (transform only)
  const box = useIndicator(listRef, "[aria-selected='true']", [value, tabs.length]);
  // keep the selected tab visible in a strip that scrolls sideways (phones), without moving the page
  useEffect(() => {
    const strip = listRef.current?.parentElement;
    const el = refs.current[value];
    if (!strip || !el || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
  }, [value]);

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
    refs.current[tabs[to].key]?.focus();
    refs.current[tabs[to].key]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  return (
    <div data-print-hide className="max-w-full overflow-x-auto border-b border-line [scrollbar-width:none]">
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
  );
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
