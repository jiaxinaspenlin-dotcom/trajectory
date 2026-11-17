"use client";

import { KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { humanStatus } from "@/lib/format";
import { cardAction, cardHref, cardSource, cardWaiting, DECK_GROUPS, DeckItem, waitedText } from "@/lib/deck";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

// The waiting records as a stack of cards: one in front, the next two peeking
// behind. Arrow buttons, Left/Right keys anywhere in the deck, or a swipe move
// through it; it stops at either end. The front card opens its record, and its
// one button says what is waiting there.
export function Deck({ items, index, onIndex, onOpen }: {
  items: DeckItem[]; index: number; onIndex: (i: number) => void; onOpen: (it: DeckItem) => void;
}) {
  const total = items.length;
  const it = items[index];
  // which way the last flip went: the new card comes in from that side
  const [dir, setDir] = useState<1 | -1>(1);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const dragged = useRef(false);

  const cardRef = useRef<HTMLDivElement>(null);
  // a flip replaces the front card: if it had focus, the new one takes it, so the
  // arrow keys keep working
  const refocus = useRef(false);
  useEffect(() => {
    if (refocus.current) cardRef.current?.focus({ preventScroll: true });
    refocus.current = false;
  }, [index]);

  const go = (to: number) => {
    if (to < 0 || to >= total || to === index) return;
    refocus.current = !!cardRef.current?.contains(document.activeElement);
    setDir(to > index ? 1 : -1);
    onIndex(to);
  };

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowRight") { go(index + 1); e.preventDefault(); }
    if (e.key === "ArrowLeft") { go(index - 1); e.preventDefault(); }
  }

  // swipe: the card follows the finger sideways; past 48px it flips
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragged.current = false;
  }
  function onPointerMove(e: PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!dragged.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) dragged.current = true;
    // past the ends the card resists
    if (dragged.current) setDrag((index === 0 && dx > 0) || (index === total - 1 && dx < 0) ? dx / 4 : dx);
  }
  function onPointerUp() {
    if (dragged.current) {
      if (drag <= -48) go(index + 1);
      else if (drag >= 48) go(index - 1);
    }
    start.current = null;
    setDrag(0);
  }

  if (!it) return null;
  const behind = Math.min(2, total - 1 - index);
  return (
    <section
      aria-roledescription="carousel"
      aria-label="Waiting Records"
      className="relative"
      onKeyDown={onKeyDown}
      data-testid="deck"
    >
      <div className="relative pb-5">
        {/* the next cards, peeking out below the front one */}
        {Array.from({ length: behind }, (_, n) => n + 1).reverse().map((n) => (
          <div key={`${n}-${index}`} aria-hidden
            className={`deck-behind absolute inset-x-0 top-0 h-full rounded-2xl ${n === 1 ? "bg-brand/45" : "bg-brand/20"}`}
            style={{ transform: `translateY(${n * 10}px) scale(${1 - n * 0.035})`, "--from-y": `${(n + 1) * 10}px`, "--from-s": `${1 - (n + 1) * 0.035}` } as React.CSSProperties} />
        ))}
        <div
          key={it.opportunity_id}
          ref={cardRef}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${total}`}
          tabIndex={0}
          data-testid="deck-card"
          className={`${dir > 0 ? "deck-in-next" : "deck-in-prev"} group relative cursor-pointer touch-pan-y select-none overflow-hidden rounded-2xl bg-brand px-6 py-7 text-white shadow-raised outline-none transition-shadow duration-base focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:px-9 sm:py-8`}
          style={drag ? { transform: `translateX(${drag}px) rotate(${drag / 60}deg)`, transition: "none" } : undefined}
          onClick={() => { if (!dragged.current) onOpen(it); }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <svg aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-48 w-72 text-white/10" viewBox="0 0 280 180" fill="none">
            <path d="M10 170 C 90 160, 140 120, 170 80 S 240 20, 275 10" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
          </svg>
          <p className="relative text-meta font-medium text-white/90">{DECK_GROUPS[it.group]?.kind ?? "Next Step"}</p>
          <div className="relative mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
            <div className="min-w-0">
              <h3 className="truncate text-[2rem] font-semibold leading-tight tracking-[-0.025em] text-white sm:text-display" data-content>{it.name}</h3>
              <p className="mt-2 text-body text-white">{cardWaiting(it)}</p>
              <p className="mt-1 text-meta text-white/90">{humanStatus(it.stage)} · {cardSource(it)} · <span className="num">{waitedText(it.age_days)}</span></p>
            </div>
            <Link
              href={cardHref(it)}
              onClick={(e) => e.stopPropagation()}
              className="btn btn-lg w-full bg-white text-brand shadow-raised hover:bg-brand-wash focus-visible:ring-white focus-visible:ring-offset-brand sm:w-auto"
            >
              {cardAction(it)}
              <ArrowRightIcon size={18} className="transition-transform duration-base ease-out group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>

      {/* position and controls: together at the bottom right, in reach of one thumb */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex min-w-0 flex-1 gap-1" aria-hidden>
          {items.map((x, i) => (
            <span key={x.opportunity_id} className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
              <span className={`block h-full origin-left rounded-full bg-brand transition-transform duration-base ease-out ${i === index ? "scale-x-100" : "scale-x-0"}`} />
            </span>
          ))}
        </div>
        <p className="num shrink-0 text-meta text-ink-muted" aria-live="polite" data-testid="deck-position">{index + 1} of {total}</p>
        <div className="flex shrink-0 gap-1">
          <button type="button" className="icon-btn h-11 w-11 border border-line disabled:opacity-40" aria-label="Previous Card" onClick={() => go(index - 1)} disabled={index === 0}>
            <ChevronLeftIcon size={18} />
          </button>
          <button type="button" className="icon-btn h-11 w-11 border border-line disabled:opacity-40" aria-label="Next Card" onClick={() => go(index + 1)} disabled={index === total - 1}>
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
