"use client";

import Link from "next/link";
import { cardHref, dashboardCardHref, DeckItem } from "@/lib/deck";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

// On a record opened from the Dashboard deck: back to the same card, where this
// record sits in the deck, and the records either side of it.
export function DeckStrip({ items, id }: { items: DeckItem[] | null; id: number }) {
  const i = items ? items.findIndex((it) => it.opportunity_id === id) : -1;
  const prev = items && i > 0 ? items[i - 1] : null;
  const next = items && i >= 0 && i < items.length - 1 ? items[i + 1] : null;
  return (
    <nav aria-label="Waiting Records" data-print-hide data-testid="deck-strip"
      className="flex items-center gap-2 border-b border-line pb-3 text-[13px] text-ink-muted">
      <Link href={dashboardCardHref(i >= 0 ? id : null)} className="link -ml-1 inline-flex items-center gap-1 text-ink-soft hover:text-ink">
        <ChevronLeftIcon size={14} />Back to Dashboard
      </Link>
      {items && i >= 0 && <span className="num">· {i + 1} of {items.length}</span>}
      {items && i >= 0 && (
        <span className="ml-auto flex items-center gap-1">
          {prev ? (
            <Link href={cardHref(prev)} className="icon-btn h-8 w-8" aria-label={`Previous: ${prev.name}`}><ChevronLeftIcon size={16} /></Link>
          ) : <span className="icon-btn h-8 w-8 opacity-40" aria-hidden><ChevronLeftIcon size={16} /></span>}
          {next ? (
            <Link href={cardHref(next)} className="icon-btn h-8 w-8" aria-label={`Next: ${next.name}`}><ChevronRightIcon size={16} /></Link>
          ) : <span className="icon-btn h-8 w-8 opacity-40" aria-hidden><ChevronRightIcon size={16} /></span>}
        </span>
      )}
    </nav>
  );
}
