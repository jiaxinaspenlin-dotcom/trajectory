"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// A small circled "i" that reveals an explanatory tooltip on hover / keyboard
// focus. The popup renders via a portal with fixed positioning so it is never
// clipped by an overflow container, and flips above/below depending on room.
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<{ x: number; top: number; bottom: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setBox({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };
  const hide = () => setBox(null);
  const below = box ? box.top < 160 : false;

  return (
    <span className="ml-1 inline-flex align-middle">
      <button
        ref={ref}
        type="button"
        aria-label={label ?? text}
        className="grid h-3.5 w-3.5 place-items-center rounded-full border border-ink-muted/60 text-[11px] font-semibold leading-none text-ink-muted transition-colors hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-1 focus-visible:ring-brand"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <span aria-hidden>i</span>
      </button>
      {box &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: box.x,
              top: below ? box.bottom + 8 : box.top - 8,
              transform: below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
            }}
            className="z-50 w-56 rounded-lg border border-line bg-white p-2 text-left text-xs font-normal leading-snug text-ink-soft shadow-raised"
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}
