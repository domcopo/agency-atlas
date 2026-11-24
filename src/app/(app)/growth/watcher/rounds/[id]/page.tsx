// One round of checks: the Watcher prompt to copy into Claude Code (copy-only; the app
// never runs or sends it), then "Attach results". Owner/managers only.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/cards/CopyButton";
import { GlassCard } from "@/components/cards/GlassCard";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { shortDate } from "@/components/watcher/Board";
import { AttachWatchResultsForm } from "@/components/watcher/Forms";
import { getMember, getWatch, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { buildWatchPrompt } from "@/lib/watch/rounds";

export const metadata: Metadata = { title: "Watcher round" };

export default async function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  const me = usesDatabase() ? await getMember() : null;
  if (!usesDatabase() || !isLead(me?.role)) return <RoleNotice title="SEO Watcher" />;
  const { id } = await params;
  const watch = await getWatch();
  const run = watch.runs.find((r) => r.id === id);
  if (!watch.ready || !run) notFound();
  const ids = new Set(run.clientIds);
  const clients = watch.clients.filter((c) => ids.has(c.id));
  const prompt = buildWatchPrompt({
    id: run.id,
    budgetUsd: run.estUsd,
    volumes: run.volumes,
    clients: clients.map((c) => ({
      domain: c.domain,
      niche: c.niche,
      keywords: watch.keywords.filter((k) => k.clientId === c.id && k.active).map((k) => ({ id: k.id, keyword: k.keyword })),
      markets: watch.markets.filter((m) => m.clientId === c.id && m.active).map((m) => ({ id: m.id, city: m.city, state: m.state, hasPosition: m.lat !== null })),
      competitors: watch.competitors.filter((x) => x.clientId === c.id && x.active).map((x) => x.domain),
    })),
  });

  return (
    <>
      <PageHeader title="Round of checks" subtitle={`${shortDate(run.createdAt.slice(0, 10))} · ${clients.map((c) => c.name).join(", ")}`} backHref="/growth/watcher" backLabel="SEO Watcher" />
      <div className="mx-auto max-w-3xl">
        <GlassCard className="space-y-1 text-sm">
          <p>
            {run.pairs} checks{run.volumes ? " + search volumes" : ""} · <span className="text-muted">estimate</span> ${run.estUsd.toFixed(2)} (set aside under the cap)
          </p>
          <p className={run.status === "attached" ? "text-lime" : "text-amber"}>
            {run.status === "attached" ? `Results attached: ${run.checksSaved ?? 0} rank checks saved${run.actualUsd !== null ? `, real cost $${run.actualUsd.toFixed(2)}` : ""}.` : "Waiting for results."}
          </p>
        </GlassCard>

        {run.status === "planned" && (
          <>
            <SectionTitle>1 · Run it in Claude Code</SectionTitle>
            <GlassCard className="space-y-2">
              <p className="text-sm text-muted">
                Copy this prompt into Claude Code (where DataForSEO is connected). It stops before the estimate, never guesses a number, and writes one results file. It carries websites, keywords and cities only, no client names.
              </p>
              <CopyButton text={prompt} label="Copy the Watcher prompt" />
              <details>
                <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">Show the prompt</summary>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-white/[0.03] p-3 text-[11px] text-muted">{prompt}</pre>
              </details>
            </GlassCard>
            <SectionTitle>2 · Attach the results</SectionTitle>
            <GlassCard>
              <AttachWatchResultsForm runId={run.id} />
            </GlassCard>
          </>
        )}
      </div>
    </>
  );
}
