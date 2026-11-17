"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TrajectoryLogo } from "@/components/TrajectoryLogo";
import { Reveal } from "@/components/ui";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { prefersReducedMotion, useScrolled } from "@/lib/motion";

// The same stages the workspace uses: Sourcing → Screening → Diligence → Decision.
const STEPS = [
  {
    title: "Sourcing",
    stages: [0],
    body: "Find founders from company sites, launch posts, and public GitHub — or receive applications. Every lead keeps its sources and a Founder Score.",
    points: ["Web search with every claim tied to a source.", "GitHub discovery and profile sync.", "A founder portal for inbound applications."],
  },
  {
    title: "Screening & Diligence",
    stages: [1, 2],
    body: "Three independent screening axes, a Bull / Bear / Referee debate, claims checked against stored evidence, and the questions to ask next.",
    points: ["Founder, market and idea scored apart, never averaged.", "Every citation opens the exact evidence.", "Diligence questions tracked to resolution."],
  },
  {
    title: "Decision",
    stages: [3],
    body: "Trajectory recommends the next step; an investor decides. Nothing is sent or invested automatically.",
    points: ["The recommendation and your decision recorded apart.", "Nothing is preselected.", "Every decision kept in the record's history."],
  },
];
const STAGE_NAMES = ["Sourcing", "Screening", "Diligence", "Decision"];

function currentStep(cards: (HTMLElement | null)[], viewportHeight: number): number {
  let step = 0;
  cards.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= viewportHeight / 2) step = i; });
  return step;
}

export default function Landing() {
  const scrolled = useScrolled(8);
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  const lineRef = useRef<SVGSVGElement>(null);

  // the current step is the last card whose top has passed the middle of the
  // screen, worked out from the scroll position itself (not from crossings), so
  // the pinned heading, the bar and the lit card agree however the page got there
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setActive(currentStep(stepRefs.current, window.innerHeight)));
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); cancelAnimationFrame(raf); };
  }, []);

  // a light parallax on the hero's trajectory line (off under reduced motion)
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (lineRef.current) lineRef.current.style.transform = `translate3d(0, ${Math.min(window.scrollY, 600) * 0.25}px, 0)`;
      });
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-white">
      <header className={`sticky top-0 z-40 bg-white/85 backdrop-blur-md transition-shadow duration-base ${scrolled ? "shadow-hairline" : ""}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="press flex items-center gap-2">
            <TrajectoryLogo size={22} />
            <span className="text-base font-semibold text-ink">Trajectory</span>
          </Link>
          <nav data-print-hide className="flex items-center gap-1" aria-label="Primary">
            <Link href="/founder" className="btn-ghost hidden sm:inline-flex">For Founders</Link>
            <Link href="/vc" className="btn-ghost">Investor Workspace</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* hero */}
        <section className="relative overflow-hidden">
          <svg ref={lineRef} aria-hidden viewBox="0 0 1200 520" fill="none" preserveAspectRatio="xMaxYMid slice"
            className="pointer-events-none absolute inset-0 h-full w-full text-brand will-change-transform">
            <path d="M-20 500 C 300 480, 520 420, 700 300 S 1000 80, 1240 30" stroke="currentColor" strokeOpacity="0.09" strokeWidth="56" strokeLinecap="round" />
            <circle cx="1130" cy="58" r="14" fill="#e8950c" fillOpacity="0.85" />
          </svg>
          <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 sm:pb-32 sm:pt-28">
            <p className="animate-rise text-meta font-medium text-brand" style={{ "--i": 0 } as React.CSSProperties}>Venture Research &amp; Deal Workflow</p>
            <h1 className="animate-rise mt-4 max-w-4xl text-[2.5rem] font-[650] leading-[1.05] tracking-[-0.035em] text-ink sm:text-[4rem]" style={{ "--i": 1 } as React.CSSProperties}>
              Find, Screen, and Decide on Founders — Grounded in Evidence
            </h1>
            <p className="animate-rise mt-6 max-w-2xl text-lg leading-8 text-ink-soft" style={{ "--i": 2 } as React.CSSProperties}>
              Trajectory connects outbound sourcing and inbound applications in one workflow, from first signal to investment decision.
            </p>
            <div className="animate-rise mt-10 flex flex-wrap items-center gap-3" style={{ "--i": 3 } as React.CSSProperties}>
              <Link href="/vc" className="btn-primary btn-lg group">
                Open Investor Workspace <ArrowRightIcon size={18} className="transition-transform duration-base ease-out group-hover:translate-x-1" />
              </Link>
              <Link href="/founder" className="btn-ghost btn-lg">Applying as a Founder? Start Here</Link>
            </div>
          </div>
        </section>

        {/* how it works: the stage panel stays pinned while the steps scroll by */}
        <section aria-labelledby="how-title" className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16 md:py-28">
            <div className="md:sticky md:top-28 md:self-start">
              <h2 id="how-title" className="text-page text-ink">How It Works</h2>
              <p className="mt-3 max-w-sm text-body text-ink-muted">The same four stages, start to finish, for every lead and every application.</p>
              <ol className="mt-8 hidden gap-1.5 md:grid md:grid-cols-4" aria-hidden>
                {STAGE_NAMES.map((name, i) => {
                  const on = STEPS[active].stages.includes(i);
                  const done = STEPS[active].stages.every((s) => s > i);
                  return (
                    <li key={name}>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-line">
                        <span className="block h-full origin-left rounded-full bg-brand transition-transform duration-[400ms] ease-out"
                          style={{ transform: `scaleX(${on || done ? 1 : 0})`, opacity: done && !on ? 0.4 : 1 }} />
                      </span>
                      <span className={`mt-2 block text-meta transition-colors duration-base ${on ? "font-semibold text-ink" : "text-ink-muted"}`}>{name}</span>
                    </li>
                  );
                })}
              </ol>
              <p key={active} className="animate-fade mt-6 hidden text-title text-ink md:block" aria-hidden>
                <span className="num mr-2 text-ink-faint">0{active + 1}</span>{STEPS[active].title}
              </p>
            </div>

            <ol className="space-y-6 md:space-y-[22vh] md:py-[8vh]">
              {STEPS.map((s, i) => (
                <li key={s.title} ref={(el) => { stepRefs.current[i] = el; }} data-step={i}>
                  <Reveal className={`rounded-2xl p-6 transition-colors duration-slow sm:p-8 ${active === i ? "bg-brand-wash" : "bg-surface-sunken"}`}>
                    <span className="num font-mono text-meta text-ink-faint">0{i + 1}</span>
                    <h3 className="mt-2 text-title text-ink">{s.title}</h3>
                    <p className="mt-2 text-body leading-7 text-ink-soft">{s.body}</p>
                    <ul className="mt-5 space-y-2">
                      {s.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2 text-sm text-ink-soft">
                          <CheckIcon size={15} className="mt-0.5 shrink-0 text-brand" />{pt}
                        </li>
                      ))}
                    </ul>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* two ways in */}
        <section aria-labelledby="ways-title" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
            <h2 id="ways-title" className="sr-only">Two Ways In</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Reveal i={0}>
                <Link href="/vc" className="card-interactive group flex h-full flex-col rounded-2xl border border-line p-7">
                  <span className="text-meta font-medium text-brand">For Investors</span>
                  <span className="mt-3 text-body leading-7 text-ink-soft">
                    A dashboard of what to do next, founders with their evidence, a pipeline from Screening to Decision, a map of every
                    lead and deal, and the fund thesis every score is measured against.
                  </span>
                  <span className="mt-6 flex items-center gap-2 font-medium text-ink group-hover:text-brand">Open Investor Workspace <ArrowRightIcon size={16} className="slide-arrow" /></span>
                </Link>
              </Reveal>
              <Reveal i={1}>
                <Link href="/founder" className="card-interactive group flex h-full flex-col rounded-2xl border border-line p-7">
                  <span className="text-meta font-medium text-brand">For Founders</span>
                  <span className="mt-3 text-body leading-7 text-ink-soft">
                    Apply with a company name and a PDF pitch deck. See your first-pass screen right away, and exactly what else
                    would help the fund decide.
                  </span>
                  <span className="mt-6 flex items-center gap-2 font-medium text-ink group-hover:text-brand">Apply to the Fund <ArrowRightIcon size={16} className="slide-arrow" /></span>
                </Link>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-5 py-8 text-xs text-ink-muted">
          Demo environment with fictional seed data alongside live public GitHub data. Humans approve every consequential action.
        </p>
      </footer>
    </div>
  );
}
