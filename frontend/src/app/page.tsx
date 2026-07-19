import Link from "next/link";
import { BullCharacter, BearCharacter, RefereeCharacter } from "@/components/arena/Characters";
import { LandingBackdrop } from "@/components/arena/LandingBackdrop";

export default function Landing() {
  return (
    <div className="relative min-h-screen">
      {/* The Investment Arena stadium behind everything (no characters) */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <LandingBackdrop />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-base font-bold text-white">T</span>
          <span className="text-lg font-semibold text-ink">Trajectory</span>
          <span className="chip bg-neutral-wash text-neutral">demo</span>
        </div>

        <div className="mt-10 max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight text-ink">
            The AI operating system for venture capital.
          </h1>
          <p className="mt-4 text-lg text-ink-soft">
            Trajectory connects two sides of a deal. Choose how you want to enter.
          </p>
        </div>

        {/* Two doors */}
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {/* VC door */}
          <Link
            href="/vc"
            className="group card flex flex-col p-6 transition-shadow hover:shadow-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <div className="flex items-center justify-between">
              <span className="chip bg-brand-wash text-brand">For Investors</span>
              <div className="flex -space-x-2">
                <BullCharacter size={40} />
                <RefereeCharacter size={40} />
                <BearCharacter size={40} />
              </div>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-ink">I&rsquo;m a VC</h2>
            <p className="mt-2 flex-1 text-sm text-ink-soft">
              Define your fund&rsquo;s thesis, discover founders before they fundraise, review
              inbound applications, and run the full <strong>Sourcing → Screening → Diligence →
              Decision</strong> workflow — with Founder Momentum, a prestige-free ranking audit, and
              the Investment Arena. You approve every consequential action.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-ink-muted">
              <li>• Investment thesis &amp; pipeline dashboard</li>
              <li>• Discovery: outbound sourcing from public GitHub</li>
              <li>• Founder profiles, Trust Scores, diligence &amp; memos</li>
            </ul>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
              Enter investor workspace <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </Link>

          {/* Founder door */}
          <Link
            href="/founder"
            className="group card flex flex-col p-6 transition-shadow hover:shadow-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-positive"
          >
            <div className="flex items-center justify-between">
              <span className="chip bg-positive-wash text-positive">For Founders</span>
              <BullCharacter size={40} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-ink">I&rsquo;m a Founder</h2>
            <p className="mt-2 flex-1 text-sm text-ink-soft">
              Apply to the fund with just your company name and a pitch deck. We validate and read
              your deck, run a fast first-pass screen, and tell you exactly what additional
              information would help — no busywork, no unnecessary fields.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-ink-muted">
              <li>• Apply with a company name + PDF pitch deck</li>
              <li>• See your extraction &amp; first-pass screen</li>
              <li>• Track what the fund still needs from you</li>
            </ul>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-positive">
              Enter founder portal <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </Link>
        </div>

        <p className="mt-8 text-xs text-ink-muted">
          This is a demonstration product. No real fund currently uses Trajectory; demo data is
          fictional and clearly labeled. AI features use OpenAI on the backend; the deterministic
          scores work with or without an API key.
        </p>
      </div>
    </div>
  );
}
