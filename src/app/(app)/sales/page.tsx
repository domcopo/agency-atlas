import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { ConversationRow } from "@/components/cards/ConversationRow";
import { GhlPipelineCard } from "@/components/cards/GhlPipelineCard";
import { GlassCard } from "@/components/cards/GlassCard";
import { KpiTile } from "@/components/cards/KpiTile";
import { ProspectCard, stageInfo } from "@/components/cards/ProspectCard";
import { WinLossChart } from "@/components/cards/WinLossChart";
import { Provenance } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import {
  getAgencySalesKpis,
  getConversations,
  getGhlSummary,
  getProspects,
  getRosterSource,
  getToday,
  getMember,
  getOps,
  getTeam,
  getWinLoss,
  showsSamples,
  usesDatabase,
} from "@/lib/data-source";
import { PriorityList } from "@/components/cards/ActionRow";
import { LeadActionForm } from "@/components/forms/LeadActionForm";
import { isSalesStage } from "@/lib/ops";
import { formatUsd, formatUsdExact } from "@/lib/format";
import type { ProspectStage } from "@/lib/types";
import Link from "next/link";
import { autoRefreshLeads } from "@/app/actions";
import { Fold } from "@/components/shell/Fold";
import { LeadRow } from "@/components/sales/LeadRow";
import { PipelineHealthCard } from "@/components/sales/PipelineHealthCard";
import { RefreshLeadsButton } from "@/components/sales/RefreshLeadsButton";
import { SalesFollowUps } from "@/components/sales/SalesFollowUps";
import { getSales, type SalesData } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { isHot, lastTouchByLead, minutesSince, nyDay, personRows, pipelineHealth, type SalesLead } from "@/lib/sales";

export const metadata: Metadata = { title: "Sales" };

const pipeline: ProspectStage[] = ["new", "contacted", "call_booked", "proposal_sent", "won", "lost"];

function monthLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
}

function refreshedLabel(iso: string | null): string {
  const m = minutesSince(iso, new Date());
  if (m === null) return "Not refreshed yet";
  if (m < 1) return "Refreshed just now";
  if (m < 60) return `Refreshed ${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `Refreshed ${h} h ago` : `Refreshed ${Math.floor(h / 24)} d ago`;
}

/** Open sales leads, hot stages first, then newest. */
function LeadList({ leads, sales, today, canTouch, limit = 25 }: { leads: SalesLead[]; sales: SalesData; today: string; canTouch: boolean; limit?: number }) {
  const last = lastTouchByLead(sales.touches);
  const sorted = [...leads].sort((a, b) => Number(isHot(b, sales.pipelines)) - Number(isHot(a, sales.pipelines)) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  if (!sorted.length) return <p className="glass rounded-3xl px-4 py-4 text-sm text-muted">No open leads here.</p>;
  const row = (l: SalesLead) => (
    <li key={l.ghlId}>
      <LeadRow lead={l} last={last.get(l.ghlId)} owner={l.assignedUserId ? (sales.users.get(l.assignedUserId) ?? null) : null} hot={isHot(l, sales.pipelines)} today={today} canTouch={canTouch} />
    </li>
  );
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <ol className="divide-y divide-line">{sorted.slice(0, limit).map(row)}</ol>
      {sorted.length > limit && (
        <details className="border-t border-line">
          <summary className="pressable flex min-h-11 cursor-pointer list-none items-center justify-center text-sm font-semibold text-violet">Show all {sorted.length}</summary>
          <ol className="divide-y divide-line border-t border-line">{sorted.slice(limit).map(row)}</ol>
        </details>
      )}
    </div>
  );
}

/** Salespeople's Sales tab: refresh, follow-ups, and every open sales lead (Mine / Everyone's). */
async function SalespersonSales({ who }: { who?: string }) {
  const me = (await getMember())!;
  const refresh = autoRefreshLeads().catch(() => undefined);
  const sales = await getSales();
  const today = nyDay(new Date().toISOString());
  const open = sales.leads.filter((l) => l.status === "open");
  const mineOnly = Boolean(me.ghlUserId) && who !== "all";
  const shown = mineOnly ? open.filter((l) => l.assignedUserId === me.ghlUserId || l.assignedUserId === null) : open;
  const names = new Map(open.map((l) => [l.ghlId, l.name]));
  const dealOptions = open.slice(0, 300).map((l) => ({ ghlId: l.ghlId, label: `${l.name} · ${l.stage ?? "No stage"}`.slice(0, 90) }));
  await refresh;
  const tab = (on: boolean) => `pressable flex min-h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold ${on ? "bg-violet-deep text-ink" : "text-muted"}`;
  return (
    <>
      <PageHeader title="Sales" subtitle="Your leads and follow-ups" />
      {!sales.ready || !sales.pipelines.some((p) => p.active) ? (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">The owner hasn&apos;t picked the sales pipelines yet.</p>
      ) : (
        <>
          <RefreshLeadsButton lastLabel={refreshedLabel(sales.lastRefresh)} />
          <SectionTitle aside={`${sales.followUps.filter((f) => f.status !== "done").length} open`}>Follow-ups</SectionTitle>
          <SalesFollowUps items={sales.followUps} leadNames={names} today={today} />
          {dealOptions.length > 0 && (
            <details className="glass mt-2.5 rounded-3xl px-4 py-1">
              <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">+ Add a follow-up</summary>
              <div className="pb-3">
                <LeadActionForm deals={dealOptions} staff={[]} today={today} />
              </div>
            </details>
          )}
          <SectionTitle aside={`${shown.length} open`}>Leads</SectionTitle>
          {me.ghlUserId ? (
            <div className="glass mb-2.5 flex gap-1 rounded-2xl p-1">
              <Link href="/sales" className={tab(mineOnly)} aria-current={mineOnly ? "page" : undefined}>Mine</Link>
              <Link href="/sales?who=all" className={tab(!mineOnly)} aria-current={!mineOnly ? "page" : undefined}>Everyone&apos;s</Link>
            </div>
          ) : (
            <p className="mb-2.5 px-1 text-[11px] text-faint">Showing everyone&apos;s leads: your login isn&apos;t linked to your GoHighLevel user yet (ask the owner).</p>
          )}
          <LeadList leads={shown} sales={sales} today={today} canTouch />
          <p className="mt-1.5 px-1 text-[11px] text-faint">&quot;Mine&quot; includes unassigned leads. New leads are added in GoHighLevel; Atlas never changes GoHighLevel.</p>
        </>
      )}
    </>
  );
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const viewer = usesDatabase() ? await getMember() : null;
  if (viewer?.role === "sales") return <SalespersonSales who={(await searchParams).who} />;
  if (usesDatabase() && !isLead(viewer?.role)) return <RoleNotice title="Sales" />;
  const today = getToday();
  const winLoss = await getWinLoss(6);
  const prospects = getProspects();
  const names = Object.fromEntries(prospects.map((p) => [p.id, p.name]));
  const open = prospects.filter((p) => p.stage !== "won" && p.stage !== "lost");
  const pipelineLow = open.reduce((n, p) => n + p.estMonthlyUsd.low, 0);
  const pipelineHigh = open.reduce((n, p) => n + p.estMonthlyUsd.high, 0);
  const conversations = getConversations();
  const real = (await getRosterSource()) !== "demo";
  const ghl = await getGhlSummary();

  const showSamples = showsSamples();
  const ops = await getOps();
  const member = usesDatabase() ? await getMember() : null;
  const canWork = Boolean(member && isLead(member.role));
  // Sales pipelines (0020): health, and every open lead. Leads refresh at most hourly.
  const refresh = member ? autoRefreshLeads().catch(() => undefined) : undefined;
  const sales = await getSales();
  await refresh;
  const salesToday = nyDay(new Date().toISOString());
  const salesOpen = sales.leads.filter((l) => l.status === "open");
  const salesConfigured = sales.ready && sales.pipelines.some((p) => p.active);
  const staff = (await getTeam()).members.map((m) => ({ id: m.id, name: m.name }));
  const leadItems = ops.priorities.filter((p) => p.action?.leadGhlId);
  const dealOptions = [...ops.deals.filter((d) => isSalesStage(d.stage)), ...ops.deals.filter((d) => !isSalesStage(d.stage))].slice(0, 300).map((d) => ({ ghlId: d.ghlId, label: `${d.name} · ${d.stage}`.slice(0, 90) }));
  const samples = (
    <>
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

  return (
    <>
      <PageHeader title="Sales" subtitle="Winning new clients for the agency" />

      {sales.ready && (
        <section id="pipelines" className="scroll-mt-16">
          {salesConfigured ? (
            <>
              <RefreshLeadsButton lastLabel={refreshedLabel(sales.lastRefresh)} />
              <SectionTitle aside={member?.role === "owner" ? <Link href="/sales/setup" className="font-semibold text-violet">Setup</Link> : undefined}>Pipeline health</SectionTitle>
              <PipelineHealthCard
                rows={pipelineHealth({ pipelines: sales.pipelines, leads: sales.leads, touches: sales.touches, today: salesToday })}
                people={member?.role === "owner" ? personRows({ people: sales.people, leads: sales.leads, touches: sales.touches, followUps: sales.followUps, today: salesToday }) : null}
              />
              <Fold title="Sales leads" summary={`${salesOpen.length} open in your sales pipelines`} label="Sales leads">
                <LeadList leads={salesOpen} sales={sales} today={salesToday} canTouch={canWork} />
              </Fold>
            </>
          ) : member?.role === "owner" ? (
            <Link href="/sales/setup" className="pressable glass block rounded-3xl p-4 text-sm">
              <span className="font-semibold text-violet">Set up Sales →</span>{" "}
              <span className="text-muted">Pick your sales pipelines, link salespeople to GoHighLevel users and set daily targets.</span>
            </Link>
          ) : (
            <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">The owner hasn&apos;t picked the sales pipelines yet.</p>
          )}
        </section>
      )}

      {ops.ready && ghl.lastSync && (
        <section id="follow-ups" className="scroll-mt-16">
          <SectionTitle aside={`${leadItems.length} open`}>Lead follow-ups</SectionTitle>
          {ops.newLeads.length > 0 && (
            <div className="mb-2.5 rounded-2xl border border-amber/35 bg-amber/8 p-3.5 text-xs">
              <p className="font-semibold text-amber">
                {ops.newLeads.length} new lead{ops.newLeads.length === 1 ? "" : "s"} in the last 7 days with no follow-up
              </p>
              <p className="text-[11px] text-faint">Counts deals in sales stages only (lead, referral, reach-out, sales call…), not onboarding or delivery.
              </p>
              <ul className="mt-1 space-y-0.5 text-muted">
                {ops.newLeads.slice(0, 5).map((d) => (
                  <li key={d.ghlId}>
                    {d.name} · {d.stage}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <PriorityList items={leadItems} staff={staff} canEdit={canWork} limit={5} empty="No lead follow-ups yet. Add one below so no lead goes quiet." />
          {canWork && dealOptions.length > 0 && (
            <details className="glass mt-2.5 rounded-3xl px-4 py-1" open={leadItems.length === 0}>
              <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">
                + Add a lead follow-up
              </summary>
              <div className="pb-3">
                <LeadActionForm deals={dealOptions} staff={staff} today={ops.today} defaultLeadId={ops.newLeads[0]?.ghlId} />
              </div>
            </details>
          )}
          <p className="mt-1.5 px-1 text-[11px] text-faint">Saved in this app only. GoHighLevel is never changed.</p>
        </section>
      )}


      <SectionTitle aside={<Provenance kind={real ? "real" : "demo"} />}>Clients won &amp; lost</SectionTitle>
      <GlassCard>
        <WinLossChart
          months={winLoss.months.map((m) => ({ ...m, label: monthLabel(m.month) }))}
          lostWithoutDate={winLoss.lostWithoutDate}
          hasRealData={real}
        />
      </GlassCard>
      <div className="mt-2.5 grid grid-cols-3 gap-2.5 text-center">
        <GlassCard padding="tight">
          <p className="font-display text-xl font-bold text-rose">{winLoss.lostTotal}</p>
          <p className="text-[10px] leading-tight text-muted">Lost all-time</p>
          <p className="text-[11px] font-semibold">{formatUsdExact(winLoss.lostTotalMrr)}/mo</p>
        </GlassCard>
        <GlassCard padding="tight">
          <p className="font-display text-xl font-bold text-amber">{winLoss.pausedCount}</p>
          <p className="text-[10px] leading-tight text-muted">Paused (at risk)</p>
          <p className="text-[11px] font-semibold">{formatUsdExact(winLoss.pausedMrr)}/mo</p>
        </GlassCard>
        <GlassCard padding="tight">
          <p className="font-display text-xl font-bold">{winLoss.lifetimeChurnPct}%</p>
          <p className="text-[10px] leading-tight text-muted">Lifetime churn</p>
          <p className="text-[11px] text-faint">lost ÷ ever signed</p>
        </GlassCard>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-faint">
        Lost = canceled or expired. Paused clients are shown separately because they may come back.
      </p>

      <GhlPipelineCard ghl={ghl} />

      {!ghl.lastSync && !showSamples && (
        <GlassCard className="mt-6 text-sm text-muted">
          Your GoHighLevel pipeline isn&apos;t synced yet. Press Sync on the Data Safety screen to copy it here
          (read-only).
        </GlassCard>
      )}

      {showSamples && samples}
    </>
  );
}
