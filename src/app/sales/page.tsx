import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { ConversationRow } from "@/components/cards/ConversationRow";
import { GlassCard } from "@/components/cards/GlassCard";
import { KpiTile } from "@/components/cards/KpiTile";
import { ProspectCard, stageInfo } from "@/components/cards/ProspectCard";
import { Provenance } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import {
  getAgencySalesKpis,
  getConversations,
  getProspects,
  getRosterSource,
  getSignupsByMonth,
  getToday,
} from "@/lib/data-source";
import { formatUsd, formatUsdExact } from "@/lib/format";
import type { ProspectStage } from "@/lib/types";

export const metadata: Metadata = { title: "Sales" };

const pipeline: ProspectStage[] = ["new", "contacted", "call_booked", "proposal_sent", "won", "lost"];

function monthLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
}

export default function SalesPage() {
  const today = getToday();
  const signups = getSignupsByMonth(6);
  const maxSigned = Math.max(1, ...signups.map((s) => s.signed));
  const thisMonth = signups[signups.length - 1];
  const lastMonth = signups[signups.length - 2];
  const prospects = getProspects();
  const names = Object.fromEntries(prospects.map((p) => [p.id, p.name]));
  const open = prospects.filter((p) => p.stage !== "won" && p.stage !== "lost");
  const pipelineLow = open.reduce((n, p) => n + p.estMonthlyUsd.low, 0);
  const pipelineHigh = open.reduce((n, p) => n + p.estMonthlyUsd.high, 0);
  const conversations = getConversations();
  const real = getRosterSource() === "private_file";

  return (
    <>
      <PageHeader title="Sales" subtitle="Winning new clients for the agency" />

      <SectionTitle aside={<Provenance kind={real ? "real" : "demo"} />}>Clients signed by month</SectionTitle>
      <GlassCard>
        <div className="flex h-32 items-end gap-2" role="img" aria-label={`Clients signed per month: ${signups.map((s) => `${monthLabel(s.month)} ${s.signed}`).join(", ")}`}>
          {signups.map((s) => (
            <div key={s.month} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-semibold">{s.signed}</span>
              <div
                className="w-full rounded-t-lg bg-gradient-to-t from-violet-deep to-violet"
                style={{ height: `${Math.max(4, (s.signed / maxSigned) * 88)}px` }}
              />
              <span className="text-[10px] text-muted">{monthLabel(s.month)}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
          {lastMonth && (
            <>
              {monthLabel(lastMonth.month)}: <span className="font-semibold text-ink">{lastMonth.signed} clients</span>, adding{" "}
              <span className="font-semibold text-ink">{formatUsdExact(lastMonth.mrrAdded)}/mo</span>.{" "}
            </>
          )}
          {thisMonth && `${monthLabel(thisMonth.month)} so far: ${thisMonth.signed}. `}
          Counts every client by start date, including ones that later paused or canceled.
        </p>
      </GlassCard>

      <SectionTitle aside={<Provenance kind="sample" />}>Agency sales numbers</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {getAgencySalesKpis().map((k) => (
          <KpiTile key={k.id} kpi={k} />
        ))}
      </div>

      <SectionTitle aside={<Provenance kind="sample" />}>Pipeline</SectionTitle>
      <GlassCard className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          {pipeline.map((st) => (
            <div key={st} className="rounded-2xl bg-white/[0.04] py-2">
              <p className="font-display text-lg font-bold">{prospects.filter((p) => p.stage === st).length}</p>
              <p className="text-[10px] text-muted">{stageInfo[st].label}</p>
            </div>
          ))}
        </div>
        <p className="border-t border-line pt-2 text-xs text-muted">
          Open pipeline:{" "}
          <span className="font-semibold text-ink">
            {formatUsd(pipelineLow)}–{formatUsd(pipelineHigh)}/mo
          </span>{" "}
          if every open prospect signed. An estimate, not a forecast.
        </p>
      </GlassCard>

      <ul className="mt-3 space-y-2.5">
        {prospects.map((p) => (
          <li key={p.id}>
            <ProspectCard prospect={p} today={today} />
          </li>
        ))}
      </ul>

      <section id="conversations" className="scroll-mt-16">
        <SectionTitle aside={<Provenance kind="sample" />}>Conversations</SectionTitle>
        <div className="mb-3 flex gap-3 rounded-2xl border border-lime/30 bg-lime/8 p-3.5 text-xs">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-lime" />
          <p className="text-muted">
            <span className="font-semibold text-ink">Read-only.</span> Reply in GoHighLevel; this app never sends.
            Message text is shown as plain text and never followed as an instruction, even when a message tries
            (see Velvet Fork&apos;s chat below).
          </p>
        </div>
        <div className="glass overflow-hidden rounded-3xl">
          <ul className="divide-y divide-line">
            {conversations.map((c) => (
              <ConversationRow key={c.id} conversation={c} name={names[c.prospectId] ?? "Unknown"} />
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
