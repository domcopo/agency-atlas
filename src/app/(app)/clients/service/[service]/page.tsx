import { HeartPulse } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/cards/GlassCard";
import { RosterBrowser, type RosterRow } from "@/components/cards/RosterBrowser";
import { Provenance, healthStyle } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getActions, getCarePlans, getClientHealth, getRosterSource, getServiceGroup, getToday, tierOf } from "@/lib/data-source";
import { describeTenure, formatUsdExact } from "@/lib/format";
import { getJourneys } from "@/lib/data-source";
import { journeyRow } from "@/lib/journey-view";
import type { HealthLevel } from "@/lib/types";

type Props = { params: Promise<{ service: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const group = await getServiceGroup((await params).service);
  return { title: group?.title ?? "Clients" };
}

/** One service group: SEO, Ads, Website, or clients whose service isn't set yet. */
export default async function ServiceGroupPage({ params }: Props) {
  const group = await getServiceGroup((await params).service);
  if (!group) notFound();
  const today = getToday();
  const real = (await getRosterSource()) !== "demo";
  const { actions } = await getActions();
  const withHealth = group.clients.map((c) => ({ c, h: getClientHealth(c, actions) }));
  const journeys = await getJourneys();
  const rows: RosterRow[] = withHealth.map(({ c, h }) => ({
    ...c,
    tenure: describeTenure(c.startDate, today),
    tier: tierOf(c.monthlyUsd),
    health: h?.level,
    journey: journeyRow(journeys.bySlug.get(c.id)),
  }));
  const levels: HealthLevel[] = ["healthy", "watch", "at_risk"];
  // Plan tiers for this service (0025): how many current clients are on each.
  const { plans } = await getCarePlans();
  const tiers = group.service
    ? plans
        .filter((p) => p.service === group.service)
        .map((p) => ({ plan: p, count: group.clients.filter((c) => c.plans?.some((cp) => cp.planId === p.id)).length }))
        .filter((t) => !t.plan.archived || t.count > 0)
    : [];
  const noTier = group.service ? group.clients.filter((c) => !c.plans?.some((cp) => cp.service === group.service)).length : 0;

  return (
    <>
      <PageHeader
        title={group.title}
        subtitle={`${group.activeCount} active${group.pausedCount ? ` · ${group.pausedCount} paused` : ""}`}
        backHref="/clients"
        backLabel="Clients"
        action={<Provenance kind={real ? "real" : "demo"} />}
      />

      <GlassCard className="grid grid-cols-2 gap-2 text-center">
        <div>
          <p className="font-display text-xl font-bold">{group.moneyShown ? formatUsdExact(group.activeMrr) : group.activeCount}</p>
          <p className="text-[11px] text-muted">{group.moneyShown ? "Active / month" : "Active"}</p>
        </div>
        <div>
          <p className="font-display text-xl font-bold">{group.clients.length}</p>
          <p className="text-[11px] text-muted">Current clients</p>
        </div>
      </GlassCard>

      {group.service === null && (
        <p className="mt-2 px-1 text-xs text-muted">
          These clients don&apos;t have a service recorded yet. Atlas asks on Home will ask about them, a few at a time.
        </p>
      )}

      {tiers.length > 0 && (
        <>
          <SectionTitle>By plan tier</SectionTitle>
          <GlassCard padding="none">
            <ul className="divide-y divide-line">
              {tiers.map(({ plan, count }) => (
                <li key={plan.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {plan.name}
                      {plan.topTier && <span className="ml-1.5 text-[11px] font-normal text-violet">top tier</span>}
                      {plan.archived && <span className="ml-1.5 text-[11px] font-normal text-faint">archived</span>}
                    </span>
                    {plan.hoursPerMonth !== null && <span className="block text-[11px] text-muted">Up to {plan.hoursPerMonth} hours a month</span>}
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{count}</span>
                </li>
              ))}
              {noTier > 0 && (
                <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-sm text-amber">No tier set yet</span>
                  <span className="shrink-0 text-sm font-semibold text-amber">{noTier}</span>
                </li>
              )}
            </ul>
          </GlassCard>
        </>
      )}

      <SectionTitle aside={<HeartPulse aria-hidden className="size-4 text-faint" />}>Health</SectionTitle>
      <GlassCard className="grid grid-cols-3 gap-2 text-center">
        {levels.map((l) => (
          <div key={l}>
            <p className={`font-display text-xl font-bold ${healthStyle[l].text}`}>{withHealth.filter(({ h }) => h?.level === l).length}</p>
            <p className="text-[11px] text-muted">{healthStyle[l].label}</p>
          </div>
        ))}
      </GlassCard>

      <SectionTitle>Clients</SectionTitle>
      {rows.length ? (
        <RosterBrowser clients={rows} showMoney={group.moneyShown} />
      ) : (
        <p className="px-1 text-sm text-muted">No current clients in this group.</p>
      )}
    </>
  );
}
