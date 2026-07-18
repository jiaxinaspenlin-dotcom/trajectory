"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, EmptyState, ErrorState, Section, Spinner } from "@/components/ui";
import { InvestmentArena } from "@/components/arena/InvestmentArena";
import { Memo, Opportunity } from "@/lib/types";

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
          <h1 className="text-xl font-semibold text-ink">Investment memo</h1>
          <p className="text-sm text-ink-muted">Evidence-backed. Missing data is explicitly labeled, never invented.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/opportunities/${id}`} className="btn-secondary">Back</Link>
          <button className="btn-secondary" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn-primary" onClick={generate}>Regenerate memo</button>
        </div>
      </div>

      {genError && <ErrorState message={genError} />}

      {opp.data && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">{opp.data.company?.name}</h2>
              <p className="text-sm text-ink-muted">{opp.data.company?.one_liner}</p>
            </div>
            {memo.data && <Badge tone="bg-neutral-wash text-neutral">v{memo.data.version} · {memo.data.generated_by}</Badge>}
          </div>
        </div>
      )}

      {memo.loading ? <Spinner /> : memo.error ? (
        <EmptyState title="No memo yet" hint="Generate the evidence-backed memo." action={<button className="btn-primary" onClick={generate}>Generate memo</button>} />
      ) : memo.data ? (
        <>
          {memo.data.recommended_action && (
            <div className="rounded-xl bg-brand-wash p-4">
              <span className="label text-brand">Final recommendation</span>
              <p className="text-lg font-semibold text-brand">{memo.data.recommended_action}</p>
              <p className="text-xs text-ink-muted">Confidence {Math.round(memo.data.confidence * 100)}%</p>
            </div>
          )}
          <div className="space-y-4">
            {memo.data.sections.map((s) => (
              <Section key={s.key} title={s.title} right={s.unavailable_label ? <Badge tone="bg-neutral-wash text-neutral">{s.unavailable_label}</Badge> : undefined}>
                <p className="whitespace-pre-line text-sm text-ink-soft">{s.body}</p>
                {s.evidence_ids.length > 0 && (
                  <p className="mt-2 text-[11px] text-ink-muted">
                    Evidence: {s.evidence_ids.map((e) => <span key={e} className="mr-1 rounded bg-surface-sunken px-1 font-mono">E{e}</span>)}
                  </p>
                )}
              </Section>
            ))}
          </div>
          <Section title="Bull, Bear & Referee">
            <InvestmentArena debate={opp.data?.debate || null} expandable={false} />
          </Section>
        </>
      ) : null}
    </div>
  );
}
