"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/useFetch";
import { Badge, Button, EmptyState, ErrorState, PageHeader, PageSkeleton, Section, Skeleton } from "@/components/ui";
import { InvestmentArena } from "@/components/arena/InvestmentArena";
import { MemoView } from "@/components/MemoView";
import { EvidenceLinkProvider } from "@/components/EvidenceRef";
import { DocumentIcon } from "@/components/icons";
import { Memo, Opportunity } from "@/lib/types";
import { humanStatus } from "@/lib/format";
import { evidenceHref } from "@/lib/pipeline";

export default function MemoPage() {
  const { id } = useParams<{ id: string }>();
  const opp = useFetch<Opportunity>(`/api/opportunities/${id}`);
  const memo = useFetch<Memo>(`/api/opportunities/${id}/memo`);
  const [genError, setGenError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setGenError(null);
    setBusy(true);
    try {
      await api.post(`/api/opportunities/${id}/memo`);
      memo.reload();
    } catch (e) {
      setGenError(
        e instanceof Error && (e.message.toLowerCase().includes("ai provider") || e.message.includes("OPENAI"))
          ? "AI is not configured — set OPENAI_API_KEY to regenerate the memo. The seeded demo memo remains available."
          : e instanceof Error ? e.message : "Memo generation failed."
      );
    } finally {
      setBusy(false);
    }
  }

  const name = opp.data?.company?.name || opp.data?.founder?.full_name;
  if (opp.loading && !opp.data) return <PageSkeleton label="Loading Memo…" />;

  return (
    <EvidenceLinkProvider href={(eid) => evidenceHref(Number(id), eid)}>
      <div className="mx-auto max-w-3xl space-y-10">
        <div className="space-y-3 print:hidden">
          <Link href={`/vc/opportunities/${id}`} className="link text-meta text-ink-muted hover:text-ink">← {name ? <span data-content>{name}</span> : "Back to the Record"}</Link>
          <PageHeader
            title="Investment Memo"
            subtitle="Evidence-backed. Missing data is explicitly labeled, never invented."
            actions={memo.data && (
              <>
                <button className="btn-ghost" onClick={() => window.print()}>Print / PDF</button>
                <Button onClick={generate} busy={busy}>Regenerate Memo</Button>
              </>
            )}
          />
        </div>

        {genError && <ErrorState message={genError} />}

        {opp.data && (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-title text-ink" data-content>{name}</p>
              {opp.data.company?.one_liner && <p className="text-body text-ink-muted" data-content>{opp.data.company.one_liner}</p>}
            </div>
            {memo.data && <Badge tone="bg-neutral-wash text-neutral">{`v${memo.data.version} · ${humanStatus(memo.data.generated_by)}`}</Badge>}
          </div>
        )}

        {memo.loading && !memo.data ? (
          <div className="space-y-4" role="status" aria-label="Loading Memo…">
            <Skeleton className="h-20 rounded-2xl" />
            {[0, 1, 2].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>)}
          </div>
        ) : memo.error ? (
          <EmptyState icon={<DocumentIcon size={20} />} title="No Memo Yet" hint="Generate the evidence-backed memo." action={<Button variant="primary" onClick={generate} busy={busy}>Generate Memo</Button>} />
        ) : memo.data ? (
          <>
            <MemoView memo={memo.data} />
            <Section title="Bull, Bear & Referee" card={false}>
              <InvestmentArena debate={opp.data?.debate || null} opportunityId={Number(id)} diligence={opp.data?.diligence ?? []} compact />
            </Section>
          </>
        ) : null}
      </div>
    </EvidenceLinkProvider>
  );
}
