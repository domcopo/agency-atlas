// New Scout run: area, kinds of business, size. The estimate is set aside under the caps
// before the run; the data is pulled in Claude Code with the prompt on the run's page.

import type { Metadata } from "next";
import { GlassCard } from "@/components/cards/GlassCard";
import { ScoutRunForm } from "@/components/scout/ScoutRunForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getMember, getScout, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { SCOUT_RULES, scoutLeft } from "@/lib/scout";

export const metadata: Metadata = { title: "New Scout run" };

export default async function NewScoutRunPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (!usesDatabase() || (!isLead(me?.role) && me?.role !== "sales")) return <RoleNotice title="Scout" />;
  const scout = await getScout();
  const left = scoutLeft({ rows: scout.spend, me: scout.me, monthlyUsd: scout.settings.monthlyUsd, myCapUsd: scout.myCapUsd, now: new Date() }).left;
  return (
    <>
      <PageHeader title="New Scout run" subtitle="Find local businesses worth a walk-in or a call." backHref="/sales/scout" backLabel="Scout" />
      {!scout.ready ? (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Scout needs one setup step first (0024 SQL).</p>
      ) : (
        <div className="mx-auto max-w-2xl">
          <GlassCard>
            <ScoutRunForm left={left} defaultArea={`${SCOUT_RULES.counties.join(", ")} counties (within ${SCOUT_RULES.radiusMiles} mi of ${SCOUT_RULES.base.label})`} />
          </GlassCard>
        </div>
      )}
    </>
  );
}
