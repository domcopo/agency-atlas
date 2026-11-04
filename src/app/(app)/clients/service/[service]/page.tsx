import { HeartPulse } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/cards/GlassCard";
import { RosterBrowser, type RosterRow } from "@/components/cards/RosterBrowser";
import { Provenance, healthStyle } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getClientHealth, getRosterSource, getServiceGroup, getToday, tierOf } from "@/lib/data-source";
import { describeTenure, formatUsdExact } from "@/lib/format";
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
  const withHealth = group.clients.map((c) => ({ c, h: getClientHealth(c) }));
  const rows: RosterRow[] = withHealth.map(({ c, h }) => ({
    ...c,
    tenure: describeTenure(c.startDate, today),
    tier: tierOf(c.monthlyUsd),
    health: h?.level,
  }));
  const levels: HealthLevel[] = ["healthy", "watch", "at_risk"];

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
          <p className="font-display text-xl font-bold">{formatUsdExact(group.activeMrr)}</p>
          <p className="text-[11px] text-muted">Active / month</p>
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
        <RosterBrowser clients={rows} />
      ) : (
        <p className="px-1 text-sm text-muted">No current clients in this group.</p>
      )}
    </>
  );
}
