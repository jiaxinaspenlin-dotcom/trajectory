"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefereeCharacter } from "./arena/Characters";
import { api } from "@/lib/api";

export interface TourStep {
  target: string; // data-tour attribute value
  title: string;
  body: string;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function GuidedTour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const highlighted = useRef<Element | null>(null);

  const clearHighlight = () => {
    if (highlighted.current) highlighted.current.classList.remove("tour-highlight");
    highlighted.current = null;
  };

  const locate = useCallback(() => {
    if (!open) return;
    const step = steps[i];
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    clearHighlight();
    if (el) {
      el.classList.add("tour-highlight");
      highlighted.current = el;
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      setTimeout(() => setRect(el.getBoundingClientRect()), prefersReducedMotion() ? 0 : 280);
    } else {
      setRect(null);
    }
  }, [i, open, steps]);

  useEffect(() => {
    if (open) locate();
    return clearHighlight;
  }, [open, i, locate]);

  const persist = useCallback((completed: boolean, skipped: boolean, lastStep: number) => {
    api.put("/api/tour", { completed, skipped, last_step: lastStep }).catch(() => {});
  }, []);

  const finish = useCallback(() => {
    clearHighlight();
    persist(true, false, steps.length);
    onClose();
  }, [onClose, persist, steps.length]);

  const skip = useCallback(() => {
    clearHighlight();
    persist(false, true, i);
    onClose();
  }, [i, onClose, persist]);

  const next = useCallback(() => setI((v) => Math.min(steps.length - 1, v + 1)), [steps.length]);
  const back = useCallback(() => setI((v) => Math.max(0, v - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, skip, next, back]);

  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, i]);

  if (!open) return null;
  const step = steps[i];
  const isLast = i === steps.length - 1;

  // Anchor the card beside the highlighted element on whichever side has more
  // room, and cap its height to the space available. Combined with the card's
  // scrollable body + pinned footer, the Next/Back/Skip buttons are ALWAYS on
  // screen — the card can never overflow the viewport. z-[60] keeps it above
  // the highlight ring. When neither side has enough room (a very tall target),
  // it falls back to a centered, scrollable card.
  const gap = 12;
  const margin = 16;
  const cardW = 380;
  const MIN_ADJACENT = 220;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;

  let cardStyle: React.CSSProperties = {
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    maxHeight: `calc(100vh - ${2 * margin}px)`,
  };
  if (rect) {
    const spaceBelow = vh - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const best = Math.max(spaceBelow, spaceAbove);
    let left = rect.left + rect.width / 2 - cardW / 2;
    left = Math.min(Math.max(left, margin), vw - cardW - margin);
    const transition = prefersReducedMotion() ? "none" : "top 0.2s ease, bottom 0.2s ease, left 0.2s ease";

    if (best >= MIN_ADJACENT) {
      const placeBelow = spaceBelow >= spaceAbove;
      cardStyle = {
        position: "fixed",
        left,
        transform: "none",
        maxHeight: placeBelow ? spaceBelow : spaceAbove,
        transition,
        ...(placeBelow ? { top: rect.bottom + gap } : { bottom: vh - rect.top + gap }),
      };
    } else {
      // very tall target — center the card so it always fully fits and scrolls.
      cardStyle = {
        position: "fixed",
        left,
        top: margin,
        transform: "none",
        maxHeight: vh - 2 * margin,
        transition,
      };
    }
  }

  return (
    // z-[60] sits ABOVE the highlighted element (z-45) so the card is never covered.
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Click-blocker: prevents interacting with the page during the tour but does
          NOT close it. The tour only closes via Skip / Finish. */}
      <div className="absolute inset-0" aria-hidden />

      <div
        ref={cardRef}
        tabIndex={-1}
        style={cardStyle}
        className="relative z-10 flex w-[380px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-brand/30 bg-white shadow-raised ring-1 ring-black/5 focus:outline-none"
        data-testid="tour-card"
      >
        {/* header — fixed */}
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
          <div className="shrink-0 motion-safe:animate-[bounce_0.9s_ease-in-out_1]">
            <RefereeCharacter state="pointing" size={44} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="label">Referee Tour</span>
              <span className="text-xs font-medium text-ink-muted">{i + 1} / {steps.length}</span>
            </div>
            {/* progress dots */}
            <div className="mt-1 flex gap-1" aria-hidden>
              {steps.map((_, idx) => (
                <span key={idx} className={`h-1 flex-1 rounded-full ${idx <= i ? "bg-brand" : "bg-line"}`} />
              ))}
            </div>
          </div>
        </div>

        {/* body — scrollable if the copy is long / space is tight */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
        </div>

        {/* footer — pinned; the Next/Back/Skip buttons are always visible */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-white px-4 py-3">
          <button className="btn-ghost text-xs" onClick={skip} data-testid="tour-skip">Skip tour</button>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={back} disabled={i === 0} data-testid="tour-back">
              Back
            </button>
            {isLast ? (
              <button className="btn-primary text-xs" onClick={finish} data-testid="tour-finish">Finish</button>
            ) : (
              <button className="btn-primary text-xs" onClick={next} data-testid="tour-next">Next</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const DASHBOARD_TOUR: TourStep[] = [
  { target: "arena", title: "Hi — I'm your Referee 👋", body: "Welcome to your investor workspace. On every founder, a Bull argues to advance and a Bear argues for caution; I weigh the evidence — not the rhetoric — and recommend your next step. You always make the final call. Let me show you around in about a minute." },
  { target: "thesis", title: "Your investment thesis", body: "This is your fund's strategy — sectors, stages, geographies, check sizes and exclusions. Every score, ranking and recommendation you see is filtered through it. Edit it any time from the Thesis tab." },
  { target: "action-queue", title: "Your action queue", body: "The single prioritized list of what to do next, and on whom — the deals you can act on now come first. Each row names the company and the one concrete next action: run analysis, resolve diligence, or review a recommendation and decide." },
  { target: "sourcing", title: "Sourcing feed (outbound)", body: "Prospects you've surfaced proactively from real public GitHub activity — founders you can evaluate before they ever apply. Add more from the Discovery tab." },
  { target: "inbound", title: "Inbound applications", body: "Founders who applied to you directly with a company name and pitch deck. Inbound and outbound converge into the same evaluation workflow." },
  { target: "momentum", title: "Founder Score & Momentum", body: "A persistent, evidence-based Founder Score (computed in code, not invented by AI) plus its direction and rate of change over time: accelerating, improving, stable, or declining." },
  { target: "prestige", title: "Standard vs prestige-free ranking", body: "A bias audit: it masks university, employer, accelerator and geography signals to show how much 'pedigree' is moving your ranking — without claiming the prestige-free view is automatically better." },
  { target: "evidence", title: "Evidence & Trust Scores", body: "Every claim links to stored evidence with a per-claim Trust Score and verification status. The AI is only ever given this stored evidence and can't cite anything that doesn't exist." },
  { target: "arena", title: "Open a founder to see me in action", body: "On any founder you'll get the full assessment — three independent axes (Founder, Market, Idea-vs-Market, never averaged), the Bull/Bear/Referee debate, an evidence-backed memo, and a recommended next step you approve or override. That's it — enjoy!" },
];
