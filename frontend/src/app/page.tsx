import Link from "next/link";
import { BullCharacter, BearCharacter, RefereeCharacter } from "@/components/arena/Characters";

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-ink-soft">{children}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-base font-bold text-white">T</span>
        <span className="text-lg font-semibold text-ink">Trajectory</span>
      </div>

      <div className="mt-10 grid items-center gap-8 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-ink">
            The AI operating system for venture capital.
          </h1>
          <p className="mt-4 text-lg text-ink-soft">
            Trajectory helps a fund move from <strong>Sourcing → Screening → Diligence → Decision</strong> —
            discovering promising founders before they fundraise, organizing evidence, and producing an
            evidence-backed recommendation within 24 hours.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Notion-level approachability with Bloomberg-level analytical depth. Humans approve every
            consequential action.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/dashboard" className="btn-primary">Enter the platform</Link>
            <Link href="/thesis" className="btn-secondary">Configure a thesis</Link>
          </div>
          <p className="mt-4 text-xs text-ink-muted">
            This is a demonstration product. No real fund currently uses Trajectory, and demo data is
            fictional and clearly labeled.
          </p>
        </div>
        <div className="card flex items-end justify-around gap-2 p-6">
          <div className="text-center"><BullCharacter size={92} /><div className="mt-1 text-xs font-medium text-bull">Bull</div></div>
          <div className="text-center"><RefereeCharacter size={92} /><div className="mt-1 text-xs font-medium text-referee">Referee</div></div>
          <div className="text-center"><BearCharacter size={92} /><div className="mt-1 text-xs font-medium text-bear">Bear</div></div>
        </div>
      </div>

      <h2 className="mt-14 text-lg font-semibold text-ink">How the workflow fits together</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Feature title="Founder Momentum">
          Beyond a static score, Trajectory measures the <em>direction and rate of change</em> of a founder’s
          execution over time — contribution activity, releases, outside contributors, product iteration —
          and labels the trajectory: accelerating, improving, stable, declining, or insufficient history.
          GitHub stars are never treated as commercial traction.
        </Feature>
        <Feature title="Prestige-Free Ranking">
          A bias &amp; sensitivity audit that masks university, employer, accelerator, investor-network and
          geography-as-proxy signals while retaining substantive evidence — what was actually built, real
          traction, technical contributions, repeated execution. It shows how much prestige moves your ranking,
          without claiming the prestige-free view is automatically superior.
        </Feature>
        <Feature title="Investment Arena">
          A Bull makes the strongest evidence-backed case to advance, a Bear makes the strongest case for
          caution, and a neutral human Referee weighs evidence <em>quality and independence</em> — not
          persuasive writing — to recommend an actionable next step, always citing real evidence.
        </Feature>
        <Feature title="Evidence-first, honest by design">
          Every important claim links to stored evidence with a per-claim Trust Score. The AI is only ever
          given stored evidence, is instructed never to invent facts, and any reference to nonexistent
          evidence is rejected. When information is missing, we say so.
        </Feature>
      </div>

      <div className="mt-10 flex items-center justify-between rounded-xl bg-brand-wash p-6">
        <p className="text-sm text-brand">Ready to see a fund’s pipeline end-to-end?</p>
        <Link href="/dashboard" className="btn-primary">Enter the platform</Link>
      </div>
      <div className="h-10" />
    </div>
  );
}
