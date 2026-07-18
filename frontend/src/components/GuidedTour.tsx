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
      // measure after scroll settles
      setTimeout(() => setRect(el.getBoundingClientRect()), prefersReducedMotion() ? 0 : 260);
    } else {
      setRect(null);
    }
  }, [i, open, steps]);

  useEffect(() => {
    if (open) locate();
    return clearHighlight;
  }, [open, i, locate]);

  const persist = useCallback(
    (completed: boolean, skipped: boolean, lastStep: number) => {
      api.put("/api/tour", { completed, skipped, last_step: lastStep }).catch(() => {});
    },
    []
  );

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
      else if (e.key === "ArrowRight") setI((v) => Math.min(steps.length - 1, v + 1));
      else if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, skip, steps.length]);

  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, i]);

  if (!open) return null;
  const step = steps[i];
  const isLast = i === steps.length - 1;

  // position card near target (below if room, else centered)
  let cardStyle: React.CSSProperties = {
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
  };
  if (rect) {
    const belowTop = rect.bottom + 16;
    const placeBelow = belowTop < window.innerHeight - 220;
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - 360);
    cardStyle = {
      position: "fixed",
      left,
      top: placeBelow ? belowTop : Math.max(16, rect.top - 220),
      transform: "none",
      transition: prefersReducedMotion() ? "none" : "top 0.25s ease, left 0.25s ease",
    };
  }

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* dimming handled by .tour-highlight box-shadow; clicking backdrop skips */}
      <div className="absolute inset-0" onClick={skip} aria-hidden />
      <div
        ref={cardRef}
        tabIndex={-1}
        style={cardStyle}
        className="z-50 w-[340px] max-w-[92vw] rounded-xl border border-line bg-white p-4 shadow-raised focus:outline-none"
        data-testid="tour-card"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 motion-safe:animate-[bounce_1s_ease-in-out_1]">
            <RefereeCharacter state="pointing" size={56} />
          </div>
          <div className="min-w-0">
            <div className="label">Step {i + 1} of {steps.length}</div>
            <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
            <p className="mt-1 text-sm text-ink-soft">{step.body}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button className="btn-ghost text-xs" onClick={skip} data-testid="tour-skip">Skip tour</button>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0} data-testid="tour-back">
              Back
            </button>
            {isLast ? (
              <button className="btn-primary text-xs" onClick={finish} data-testid="tour-finish">Finish</button>
            ) : (
              <button className="btn-primary text-xs" onClick={() => setI((v) => Math.min(steps.length - 1, v + 1))} data-testid="tour-next">
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const DASHBOARD_TOUR: TourStep[] = [
  { target: "thesis", title: "1. Investment thesis", body: "Your fund’s configurable thesis. Every sourcing result, score, ranking and recommendation is evaluated through it." },
  { target: "sourcing", title: "2. Sourcing feed", body: "Outbound prospects surfaced from real public GitHub execution signals — before founders formally fundraise." },
  { target: "inbound", title: "3. Inbound applications", body: "Founder applications enter here with a company name and a pitch deck, then converge into the same workflow." },
  { target: "momentum", title: "4 & 5. Founder Score & Momentum", body: "A persistent, evidence-based Founder Score plus its direction and rate of change over time." },
  { target: "prestige", title: "6. Standard vs prestige-free ranking", body: "A bias & sensitivity audit: how much do university/employer/accelerator brands move the ranking?" },
  { target: "attention", title: "7–9. Three screening axes", body: "Founder, Market, and Idea-vs-Market are assessed independently and never averaged into one number." },
  { target: "evidence", title: "10. Evidence & Trust Scores", body: "Every claim links to stored evidence with a per-claim Trust Score and verification status." },
  { target: "attention", title: "11. Diligence & contradictions", body: "Contradictions and missing information are surfaced, and targeted diligence questions are generated." },
  { target: "arena", title: "12. Investment Arena", body: "Bull, Bear, and a neutral Referee weigh the evidence. The Referee judges quality, not persuasiveness." },
  { target: "arena", title: "13. Investment memo", body: "From the same evidence we generate an evidence-backed memo, labeling anything not disclosed or unverified." },
  { target: "arena", title: "14. Recommended next action", body: "The Referee recommends an actionable next step — but a human always approves consequential actions." },
  { target: "timers", title: "15. 24-hour decision status", body: "We track time from first signal to an actionable recommendation, aiming for within 24 hours." },
];
