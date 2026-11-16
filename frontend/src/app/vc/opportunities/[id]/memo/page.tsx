"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, EmptyState, ErrorState, Section, Spinner } from "@/components/ui";
import { InvestmentArena } from "@/components/arena/InvestmentArena";
import { MemoView } from "@/components/MemoView";
import { Memo, Opportunity } from "@/lib/types";
import { humanStatus } from "@/lib/format";

export default function MemoPage() {
  const { id } = useParams<{ id: string }>();
  const opp = useFetch<Opportunity>(`/api/opportunities/${id}`);
  const memo = useFetch<Memo>(`/api/opportunities/${id}/memo`);
  const [genError, setGenError] = useState<string | null>(null);

  async function generate() {
    setGenError(null);
    try {
      await api.post(`/api/opportunities/${id}/memo`);
      memo.reload();
    } catch (e) {
      setGenError(
        e instanceof Error && (e.message.toLowerCase().includes("ai provider") || e.message.includes("OPENAI"))
          ? "AI is not configured — set OPENAI_API_KEY to regenerate the memo. The seeded demo memo remains available."
          : e instanceof Error ? e.message : "Memo generation failed."
      );
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-ink">Investment Memo</h1>
          <p className="text-sm text-ink-muted">Evidence-backed. Missing data is explicitly labeled, never invented.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/vc/opportunities/${id}`} className="btn-secondary">Back</Link>
          <button className="btn-secondary" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn-primary" onClick={generate}>Regenerate Memo</button>
        </div>
      </div>

      {genError && <ErrorState message={genError} />}

      {opp.data && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink" data-content>{opp.data.company?.name}</h2>
              <p className="text-sm text-ink-muted" data-content>{opp.data.company?.one_liner}</p>
            </div>
            {memo.data && <Badge tone="bg-neutral-wash text-neutral">{`v${memo.data.version} · ${humanStatus(memo.data.generated_by)}`}</Badge>}
          </div>
        </div>
      )}

      {memo.loading ? <Spinner /> : memo.error ? (
        <EmptyState title="No Memo Yet" hint="Generate the evidence-backed memo." action={<button className="btn-primary" onClick={generate}>Generate Memo</button>} />
      ) : memo.data ? (
        <>
          <MemoView memo={memo.data} />
          <Section title="Bull, Bear & Referee">
            <InvestmentArena debate={opp.data?.debate || null} expandable={false} />
          </Section>
        </>
      ) : null}
    </div>
  );
}
