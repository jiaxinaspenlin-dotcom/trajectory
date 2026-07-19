"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
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

  // Position the card using its ACTUAL measured height, then clamp so the whole
  // card — including the pinned footer with Next/Back — is always inside the
  // viewport. The card's max-height is capped at (viewport - 2*margin) and its
  // body scrolls, so clamping can never push the footer off-screen.
  const measure = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const margin = 16;
    const gap = 12;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const h = el.offsetHeight; // real height, already capped by max-height
    const w = el.offsetWidth;
    let top: number;
    let left: number;
    if (rect) {
      if (rect.bottom + gap + h <= vh - margin) top = rect.bottom + gap; // below target
      else if (rect.top - gap - h >= margin) top = rect.top - gap - h; // above target
      else top = rect.bottom + gap; // clamped below
      left = rect.left + rect.width / 2 - w / 2;
    } else {
      top = (vh - h) / 2;
      left = (vw - w) / 2;
    }
    top = Math.max(margin, Math.min(top, vh - margin - h));
    left = Math.max(margin, Math.min(left, vw - margin - w));
    setPos({ top, left });
  }, [rect]);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, i, rect, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  if (!open) return null;
  const step = steps[i];
  const isLast = i === steps.length - 1;

  const cardStyle: React.CSSProperties = {
    position: "fixed",
    top: pos ? pos.top : -9999,
    left: pos ? pos.left : -9999,
    maxHeight: "calc(100vh - 32px)",
    opacity: pos ? 1 : 0,
    transition: prefersReducedMotion() ? "none" : "top 0.18s ease, left 0.18s ease",
  };

  return (
    // z-[60] sits ABOVE the highlighted element (z-45) so the card is never covered.
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Guided Tour">
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
          <button className="btn-ghost text-xs" onClick={skip} data-testid="tour-skip">Skip Tour</button>
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
  { target: "arena", title: "I'm your Referee", body: "Welcome to your investor workspace. On every founder, a Bull argues to advance and a Bear argues for caution; I weigh the evidence, not the rhetoric, and recommend your next step. You always make the final call. Here's a quick tour." },
  { target: "thesis", title: "Your investment thesis", body: "This is your fund's strategy — sectors, stages, geographies, check sizes and exclusions. Every score, ranking and recommendation you see is filtered through it. Edit it any time from the Thesis tab." },
  { target: "action-queue", title: "Your action queue", body: "The single prioritized list of what to do next, and on whom — the deals you can act on now come first. Each row names the company and the one concrete next action: run analysis, resolve diligence, or review a recommendation and decide." },
  { target: "sourcing", title: "Sourcing feed (outbound)", body: "Prospects you've surfaced proactively from real public GitHub activity — founders you can evaluate before they ever apply. Add more from the Discovery tab." },
  { target: "inbound", title: "Inbound applications", body: "Founders who applied to you directly with a company name and pitch deck. Inbound and outbound converge into the same evaluation workflow." },
  { target: "momentum", title: "Founder Score & Momentum", body: "A persistent, evidence-based Founder Score (computed in code, not invented by AI) plus its direction and rate of change over time: accelerating, improving, stable, or declining." },
  { target: "evidence", title: "Evidence & Trust Scores", body: "Every claim links to stored evidence with a per-claim Trust Score and verification status. The AI is only ever given this stored evidence and can't cite anything that doesn't exist." },
  { target: "arena", title: "Open a founder to see me in action", body: "On any founder you'll get the full assessment — three independent axes (Founder, Market, Idea-vs-Market, never averaged), the Bull/Bear/Referee debate, an evidence-backed memo, and a recommended next step you approve or override." },
];
