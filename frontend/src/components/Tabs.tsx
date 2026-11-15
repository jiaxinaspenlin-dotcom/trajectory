"use client";

import { KeyboardEvent, ReactNode, useRef } from "react";

export interface TabItem<T extends string> {
  key: T;
  label: ReactNode;
  // short count or status shown after the label (e.g. "3" or an error dot)
  badge?: ReactNode;
}

// Accessible tabs (WAI-ARIA tabs pattern, automatic activation): one tab stop,
// Left/Right/Home/End move and select. The tab list scrolls inside itself on
// narrow screens instead of widening the page. Panels use `tabPanelProps`.
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
    <div className="max-w-full overflow-x-auto border-b border-line [scrollbar-width:none]">
      <div role="tablist" aria-label={label} className="flex min-w-max gap-1" onKeyDown={onKeyDown}>
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
              className={`relative -mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 font-medium transition-colors focus-visible:outline-offset-[-2px] ${
                size === "sm" ? "h-10 px-3 text-sm" : "h-11 px-3.5 text-[15px]"} ${
                selected ? "border-brand text-brand" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink"}`}
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
    className: "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-lg",
  };
}
