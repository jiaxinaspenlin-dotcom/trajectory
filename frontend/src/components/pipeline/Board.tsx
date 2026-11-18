"use client";

import { KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { humanStatus } from "@/lib/format";
import { stageDot } from "@/lib/pipeline";
import { columns, DEAL_STAGES, EMPTY_COLUMN } from "@/lib/pipelineBoard";
import { prefersReducedMotion } from "@/lib/motion";
import { PipelineDeal } from "@/lib/types";
import { CountUp } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { DealCard } from "./DealCard";

const ALL = ["sourcing", ...DEAL_STAGES] as const;

// The board: Sourcing as a slim summary, then one column per Pipeline stage. Cards
// can't be dragged; a deal moves only through its real action. Whenever a card's
// place changes (a stage change, a filter), it glides from where it was.
export function Board({ deals, sourcing, selected, nextUpId, focusStage, onSelect }: {
  deals: PipelineDeal[];
  // leads in Sourcing (they live in Founders)
  sourcing: number;
  selected: number | null;
  nextUpId: number | null;
  // a stage to bring into view (a ?stage= deep link)
  focusStage: string | null;
  onSelect: (d: PipelineDeal) => void;
}) {
  const cols = columns(deals);
  const counts: Record<string, number> = { sourcing, screening: cols.screening.length, diligence: cols.diligence.length, decision: cols.decision.length };
  const cards = useRef(new Map<number, HTMLButtonElement>());
  const rects = useRef(new Map<number, DOMRect>());
  const first = useRef(true);

  // FLIP: every card that moved animates from its old place (transform only);
  // a card that wasn't there rises in. Instant under reduced motion.
  useLayoutEffect(() => {
    const now = new Map<number, DOMRect>();
    cards.current.forEach((el, id) => now.set(id, el.getBoundingClientRect()));
    if (!first.current && !prefersReducedMotion() && typeof Element.prototype.animate === "function") {
      now.forEach((r, id) => {
        const el = cards.current.get(id)!;
        const was = rects.current.get(id);
        if (!was) {
          el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        } else if (Math.abs(was.left - r.left) > 1 || Math.abs(was.top - r.top) > 1) {
          el.animate([{ transform: `translate(${was.left - r.left}px, ${was.top - r.top}px)` }, { transform: "none" }], { duration: 360, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        }
      });
    }
    rects.current = now;
    first.current = false;
  });

  // below 1280px the columns scroll sideways inside the board (one stage per
  // screen on phones), with a strip of stage names that shows which is in view
  const strip = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Record<string, HTMLElement | null>>({});
  const [inView, setInView] = useState<string>("sourcing");
  const show = (s: string, smooth = true) => {
    const el = colRefs.current[s], box = strip.current;
    if (el && box && box.scrollWidth > box.clientWidth) box.scrollTo({ left: el.offsetLeft - box.offsetLeft, behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    const s = focusStage && (ALL as readonly string[]).includes(focusStage) ? focusStage : null;
    if (s) { setInView(s); show(s, false); } else onScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStage]);
  function onScroll() {
    const box = strip.current;
    if (!box) return;
    let best = "sourcing", dist = Infinity;
    for (const s of ALL) {
      const el = colRefs.current[s];
      if (!el) continue;
      const d = Math.abs(el.offsetLeft - box.offsetLeft - box.scrollLeft);
      if (d < dist) { dist = d; best = s; }
    }
    setInView(best);
  }

  // arrow keys move between cards: up and down in a column, left and right across
  function onCardKey(e: KeyboardEvent<HTMLButtonElement>, stage: (typeof DEAL_STAGES)[number], i: number) {
    let target: PipelineDeal | undefined;
    if (e.key === "ArrowDown") target = cols[stage][i + 1];
    else if (e.key === "ArrowUp") target = cols[stage][i - 1];
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const k = DEAL_STAGES.indexOf(stage);
      for (let j = k + (e.key === "ArrowRight" ? 1 : -1); j >= 0 && j < DEAL_STAGES.length; j += e.key === "ArrowRight" ? 1 : -1) {
        const col = cols[DEAL_STAGES[j]];
        if (col.length) { target = col[Math.min(i, col.length - 1)]; break; }
      }
    } else return;
    e.preventDefault();
    if (!target) return;
    cards.current.get(target.id)?.focus();
    cards.current.get(target.id)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (selected != null) onSelect(target);
  }

  return (
    <div data-testid="board">
      {/* which stage is in view, when they don't all fit */}
      <div className="mb-3 flex justify-between gap-1 sm:justify-start xl:hidden" role="group" aria-label="Stages" data-print-hide>
        {ALL.map((s) => (
          <button key={s} type="button" aria-pressed={inView === s} onClick={() => { setInView(s); show(s); }}
            className={`press flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-[13px] transition-colors duration-fast sm:px-3 sm:text-sm ${inView === s ? "bg-ink text-white" : "text-ink-muted hover:bg-surface-sunken hover:text-ink"}`}>
            <span aria-hidden className={`hidden h-1.5 w-1.5 shrink-0 rounded-full sm:block ${stageDot(s)}`} /><span>{humanStatus(s)}</span><span className="num">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div ref={strip} onScroll={onScroll}
        className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:scroll-px-6 [scrollbar-width:none] sm:-mx-6 sm:px-6 xl:mx-0 xl:snap-none xl:overflow-visible xl:px-0">
        {/* Sourcing: a summary, not cards; leads enter the Pipeline only by Move to Screening */}
        <section ref={(el) => { colRefs.current.sourcing = el; }} aria-labelledby="col-sourcing" data-testid="column-sourcing"
          className="relative w-[85%] shrink-0 snap-start sm:w-[17rem] xl:w-44">
          <ColumnHead stage="sourcing" count={sourcing} />
          <div className="mt-3 rounded-xl bg-surface-sunken p-4">
            <p className="text-[15px] text-ink-soft"><span className="num font-semibold text-ink">{sourcing}</span> {sourcing === 1 ? "Lead" : "Leads"} in Founders</p>
            <p className="mt-1 text-meta text-ink-muted">A lead joins the Pipeline when you move it to Screening.</p>
            <Link href="/vc/founders" className="link mt-3 inline-flex items-center gap-1 text-meta">Open Founders<ArrowRightIcon size={13} /></Link>
          </div>
        </section>

        {DEAL_STAGES.map((stage, c) => (
          <section key={stage} ref={(el) => { colRefs.current[stage] = el; }} aria-labelledby={`col-${stage}`} data-testid={`column-${stage}`}
            // relative: absolutely placed text inside (screen-reader copies) stays in the scroller
            className={`relative w-[85%] shrink-0 snap-start sm:w-[20rem] xl:w-auto xl:min-w-0 xl:flex-1 ${focusStage === stage ? "xl:rounded-xl xl:bg-brand-wash/40 xl:p-2" : ""}`}>
            <ColumnHead stage={stage} count={cols[stage].length} />
            {cols[stage].length ? (
              <ul className="mt-3 max-h-[70dvh] space-y-3 overflow-y-auto overscroll-contain p-0.5 xl:max-h-[calc(100dvh-15rem)]" aria-label={`${humanStatus(stage)} Deals`}>
                {cols[stage].map((d, i) => (
                  <li key={d.id} className="animate-rise" style={{ "--i": c * 2 + Math.min(i, 6) } as React.CSSProperties}>
                    <DealCard d={d} selected={selected === d.id} nextUp={nextUpId === d.id}
                      ref={(el) => { if (el) cards.current.set(d.id, el); else cards.current.delete(d.id); }}
                      onOpen={() => onSelect(d)} onKeyDown={(e) => onCardKey(e, stage, i)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-5 text-meta text-ink-muted" data-testid={`empty-${stage}`}>{EMPTY_COLUMN[stage]}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function ColumnHead({ stage, count }: { stage: string; count: number }) {
  return (
    <h2 id={`col-${stage}`} className="flex items-center gap-2 text-section text-ink">
      <span aria-hidden className={`h-2 w-2 rounded-full ${stageDot(stage)}`} />
      {humanStatus(stage)}
      <span className="num ml-auto text-meta font-medium text-ink-muted"><CountUp value={count} /></span>
    </h2>
  );
}
