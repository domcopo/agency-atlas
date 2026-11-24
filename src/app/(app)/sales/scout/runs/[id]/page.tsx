// One Scout run: its settings, the Scout prompt to copy into Claude Code (copy-only; the
// app never runs or sends it), and "Attach results". The database decides who may see it
// (a salesperson: only their own runs).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/cards/CopyButton";
import { GlassCard } from "@/components/cards/GlassCard";
import { AttachResultsForm } from "@/components/scout/AttachResultsForm";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getMember, getScout, usesDatabase } from "@/lib/data-source";
import { formatShortDate } from "@/lib/format";
import { isLead } from "@/lib/roles";
import { buildScoutPrompt } from "@/lib/scout-prompt";

export const metadata: Metadata = { title: "Scout run" };

export default async function ScoutRunPage({ params }: { params: Promise<{ id: string }> }) {
  const me = usesDatabase() ? await getMember() : null;
  if (!usesDatabase() || (!isLead(me?.role) && me?.role !== "sales")) return <RoleNotice title="Scout" />;
  const { id } = await params;
  const scout = await getScout();
  const run = scout.runs.find((r) => r.id === id);
  if (!run) notFound();
  const prompt = buildScoutPrompt({ id: run.id, area: run.area, kinds: run.kinds, size: run.size, budgetUsd: run.estUsd });
  return (
    <>
      <PageHeader title="Scout run" subtitle={`${run.area} · ${formatShortDate(run.createdAt.slice(0, 10))}`} backHref="/sales/scout" backLabel="Scout" />
      <div className="mx-auto max-w-3xl">
        <GlassCard className="space-y-1 text-sm">
          <p>
            <span className="text-muted">Kinds:</span> {run.kinds.join(", ")}
          </p>
          <p>
            <span className="text-muted">Up to</span> {run.size} businesses · <span className="text-muted">estimate</span> ${run.estUsd.toFixed(2)} (set aside under the cap)
          </p>
          <p className={run.status === "attached" ? "text-lime" : "text-amber"}>{run.status === "attached" ? `Results attached: ${run.found ?? 0} new prospects saved.` : "Waiting for results."}</p>
        </GlassCard>

        {run.status === "planned" && (
          <>
            <SectionTitle>1 · Run it in Claude Code</SectionTitle>
            <GlassCard className="space-y-2">
              <p className="text-sm text-muted">Copy this prompt into Claude Code (where DataForSEO is connected). It stops before the budget, leaves out phone numbers, emails and people&apos;s names, and writes one results file.</p>
              <CopyButton text={prompt} label="Copy the Scout prompt" />
              <details>
                <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">Show the prompt</summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-white/[0.03] p-3 text-[11px] text-muted">{prompt}</pre>
              </details>
            </GlassCard>
            <SectionTitle>2 · Attach the results</SectionTitle>
            <GlassCard>
              <AttachResultsForm runId={run.id} />
            </GlassCard>
          </>
        )}
      </div>
    </>
  );
}
