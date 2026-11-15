import Link from "next/link";
import { TrajectoryLogo } from "@/components/TrajectoryLogo";
import { ArrowRightIcon } from "@/components/icons";

const STEPS = [
  {
    n: "01",
    title: "Source from public evidence",
    body: "Find builders on public GitHub before they fundraise. Every founder gets an evidence trail and a deterministic Founder Score.",
  },
  {
    n: "02",
    title: "Screen and diligence",
    body: "Three independent screening axes, a Bull / Bear / Referee debate, claims with trust scores, and diligence questions — all cited to stored evidence.",
  },
  {
    n: "03",
    title: "Decide, with a human in charge",
    body: "Trajectory recommends the next step. Investors approve every consequential action; nothing is sent or invested automatically.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-white">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <TrajectoryLogo size={22} />
            <span className="text-base font-semibold text-ink">Trajectory</span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Primary">
            <Link href="/founder" className="btn-ghost hidden sm:inline-flex">For founders</Link>
            <Link href="/vc" className="btn-secondary">Investor workspace</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="dot-grid border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
            <p className="label text-brand">Venture research &amp; deal workflow</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">
              Find, screen, and decide on founders — grounded in evidence.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-7 text-ink-soft">
              Trajectory connects outbound sourcing and inbound applications in one workflow, from first signal to investment decision.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/vc" className="btn-primary h-10 px-5 text-[15px]">
                Open investor workspace <ArrowRightIcon size={15} />
              </Link>
              <Link href="/founder" className="btn-ghost h-10 px-4 text-[15px]">
                Applying as a founder? Start here
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14">
          <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="bg-white p-6">
                <span className="num font-mono text-xs text-ink-faint">{s.n}</span>
                <h2 className="mt-2 text-base font-semibold text-ink">{s.title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-ink-muted">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-line p-6">
              <p className="label">For investors</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                A map of every lead and deal, a founder table with evidence and momentum, a pipeline of next actions, and a fund
                profile that every score is evaluated against.
              </p>
              <Link href="/vc" className="btn-secondary mt-4">Enter the workspace</Link>
            </div>
            <div className="rounded-lg border border-line p-6">
              <p className="label">For founders</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Apply with a company name and a PDF pitch deck. See your first-pass screen right away, and exactly what else
                would help the fund decide.
              </p>
              <Link href="/founder" className="btn-secondary mt-4">Apply to the fund</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-5 py-6 text-xs text-ink-muted">
          Demo environment with fictional seed data alongside live public GitHub data. Humans approve every consequential action.
        </p>
      </footer>
    </div>
  );
}
