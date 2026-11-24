import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { autoRefreshLeads } from "@/app/actions";
import { PriorityList } from "@/components/cards/ActionRow";
import { ConversationRow } from "@/components/cards/ConversationRow";
import { GlassCard } from "@/components/cards/GlassCard";
import { KpiTile } from "@/components/cards/KpiTile";
import { ProspectCard, stageInfo } from "@/components/cards/ProspectCard";
import { LeadActionForm } from "@/components/forms/LeadActionForm";
import { Provenance } from "@/components/labels/labels";
import { AuditDoors, AuditsCard } from "@/components/sales/AuditsCard";
import { SalesLeaderboard } from "@/components/sales/SalesLeaderboard";
import { ScoutCard } from "@/components/scout/ScoutCard";
import { LeadRow } from "@/components/sales/LeadRow";
import { PipelineHealthCard } from "@/components/sales/PipelineHealthCard";
import { RefreshLeadsButton } from "@/components/sales/RefreshLeadsButton";
import { SalesFollowUps } from "@/components/sales/SalesFollowUps";
import { Fold } from "@/components/shell/Fold";
import { Column, Columns } from "@/components/shell/Columns";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import {
  getAgencySalesKpis,
  getConversations,
  getMember,
  getOps,
  getProspects,
  getSales,
  getTeam,
  getToday,
  showsSamples,
  usesDatabase,
  type SalesData,
} from "@/lib/data-source";
import { formatUsd } from "@/lib/format";
import { isLead } from "@/lib/roles";
import { isHot, lastTouchByLead, minutesSince, nyDay, personRows, pipelineHealth, splitLeadFollowUps, type SalesLead } from "@/lib/sales";
import type { ProspectStage } from "@/lib/types";

export const metadata: Metadata = { title: "Sales" };

const pipeline: ProspectStage[] = ["new", "contacted", "call_booked", "proposal_sent", "won", "lost"];

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
      <LeadRow lead={l} last={last.get(l.ghlId)} hot={isHot(l, sales.pipelines)} today={today} canTouch={canTouch} />
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
      <PageHeader title="Sales" subtitle="Your leads and follow-ups" action={<SalesLeaderboard variant="card" owner={false} />} />
      <SalesLeaderboard variant="chips" owner={false} />
      <AuditDoors />
      {!sales.ready || !sales.pipelines.some((p) => p.active) ? (
        <>
          <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">The owner hasn&apos;t picked the sales pipelines yet.</p>
          <AuditsCard mine />
          <ScoutCard />
        </>
      ) : (
        <>
          <RefreshLeadsButton lastLabel={refreshedLabel(sales.lastRefresh)} />
          {/* Wide screens: follow-ups on the left, leads on the right. */}
          <Columns>
          <Column>
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
          <AuditsCard mine />
          <ScoutCard />
          </Column>
          <Column>
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
          </Column>
          </Columns>
        </>
      )}
    </>
  );
}

/** Owner and managers: Pipeline health, then one follow-up list, then every open sales lead. */
async function LeadSales({ member }: { member: { role: string } }) {
  const refresh = autoRefreshLeads().catch(() => undefined);
  const [sales, ops, team] = await Promise.all([getSales(), getOps(), getTeam()]);
  await refresh;
  const today = nyDay(new Date().toISOString());
  const owner = member.role === "owner";
  if (!sales.ready) return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Sales needs one setup step first (0020 SQL).</p>;
  if (!sales.pipelines.some((p) => p.active)) {
    // Audits don't need pipelines, so they show even before Sales is set up.
    return (
      <>
        {owner ? (
          <Link href="/sales/setup" className="pressable glass block rounded-3xl p-4 text-sm">
            <span className="font-semibold text-violet">Set up Sales →</span>{" "}
            <span className="text-muted">Pick your sales pipelines, link salespeople to GoHighLevel users and set daily targets.</span>
          </Link>
        ) : (
          <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">The owner hasn&apos;t picked the sales pipelines yet.</p>
        )}
        <AuditsCard mine={false} />
        <ScoutCard />
      </>
    );
  }
  const open = sales.leads.filter((l) => l.status === "open");
  const staff = team.members.map((m) => ({ id: m.id, name: m.name }));
  // One follow-up list: follow-ups on sales-pipeline leads. Older ones on leads in other
  // pipelines are kept underneath, folded, so nothing is lost.
  const split = splitLeadFollowUps(ops.priorities, (p) => p.action?.leadGhlId, new Set(sales.leads.map((l) => l.ghlId)));
  const dealOptions = open.slice(0, 300).map((l) => ({ ghlId: l.ghlId, label: `${l.name} · ${l.stage ?? "No stage"}`.slice(0, 90) }));
  return (
    <>
      <RefreshLeadsButton lastLabel={refreshedLabel(sales.lastRefresh)} />
      {!sales.lastRefresh && <p className="mt-1.5 px-1 text-[11px] text-faint">Leads haven&apos;t been copied from GoHighLevel yet. Press Refresh leads.</p>}

      <SectionTitle aside={owner ? <Link href="/sales/setup" className="font-semibold text-violet">Setup</Link> : undefined}>Pipeline health</SectionTitle>
      <PipelineHealthCard
        rows={pipelineHealth({ pipelines: sales.pipelines, leads: sales.leads, touches: sales.touches, today })}
        people={owner ? personRows({ people: sales.people, leads: sales.leads, touches: sales.touches, followUps: sales.followUps, today }) : null}
      />

      {/* Wide screens: follow-ups on the left, sales leads on the right. */}
      <Columns>
      <Column>
      <section id="follow-ups" className="scroll-mt-16">
        <SectionTitle aside={`${split.sales.length} open`}>Follow-ups</SectionTitle>
        <PriorityList items={split.sales} staff={staff} canEdit limit={8} empty="No lead follow-ups yet. Add one so no lead goes quiet." />
        {dealOptions.length > 0 && (
          <details className="glass mt-2.5 rounded-3xl px-4 py-1">
            <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">+ Add a follow-up</summary>
            <div className="pb-3">
              <LeadActionForm deals={dealOptions} staff={staff} today={today} />
            </div>
          </details>
        )}
        {split.other.length > 0 && (
          <Fold title="Other lead follow-ups" summary="On leads outside your sales pipelines" badge={`${split.other.length} open`} label="Other lead follow-ups">
            <PriorityList items={split.other} staff={staff} canEdit limit={10} empty="" />
          </Fold>
        )}
        <p className="mt-1.5 px-1 text-[11px] text-faint">Saved in this app only. GoHighLevel is never changed.</p>
      </section>

      <AuditsCard mine={false} />
      <ScoutCard />
      </Column>
      <Column>
      <SectionTitle aside={`${open.length} open`}>Sales leads</SectionTitle>
      <LeadList leads={open} sales={sales} today={today} canTouch />
      </Column>
      </Columns>
    </>
  );
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const viewer = usesDatabase() ? await getMember() : null;
  if (viewer?.role === "sales") return <SalespersonSales who={(await searchParams).who} />;
  if (usesDatabase() && !isLead(viewer?.role)) return <RoleNotice title="Sales" />;
  const today = getToday();
  const prospects = getProspects();
  const names = Object.fromEntries(prospects.map((p) => [p.id, p.name]));
  const open = prospects.filter((p) => p.stage !== "won" && p.stage !== "lost");
  const pipelineLow = open.reduce((n, p) => n + p.estMonthlyUsd.low, 0);
  const pipelineHigh = open.reduce((n, p) => n + p.estMonthlyUsd.high, 0);
  const conversations = getConversations();
  const showSamples = showsSamples();
  const samples = (
    <>
      <SectionTitle aside={<Provenance kind="sample" />}>Agency sales numbers</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-4 xl:grid-cols-6">
        {getAgencySalesKpis().map((k) => (
          <KpiTile key={k.id} kpi={k} />
        ))}
      </div>

      {/* Wide screens: pipeline and prospects on the left, conversations on the right. */}
      <Columns>
      <Column>
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

      </Column>
      <Column>
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
      </Column>
      </Columns>
    </>
  );

  return (
    <>
      <PageHeader
        title="Sales"
        subtitle="Winning new clients for the agency"
        action={viewer || showSamples ? <SalesLeaderboard variant="card" owner={viewer?.role === "owner"} /> : undefined}
      />
      {(viewer || showSamples) && <SalesLeaderboard variant="chips" owner={viewer?.role === "owner"} />}
      {(viewer || showSamples) && <AuditDoors />}
      {viewer && <LeadSales member={viewer} />}
      {showSamples && samples}
    </>
  );
}
