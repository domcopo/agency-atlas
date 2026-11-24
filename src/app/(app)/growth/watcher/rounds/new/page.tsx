// Start a round of checks (owner/managers): pick the watched clients, see the estimate
// against what's left of the monthly cap. The round itself runs in Claude Code.

import type { Metadata } from "next";
import { GlassCard } from "@/components/cards/GlassCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { StartRoundForm } from "@/components/watcher/Forms";
import { getMember, getWatch, usesDatabase, WATCH_SETUP } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { nyToday, volumesDue } from "@/lib/watch/rounds";

export const metadata: Metadata = { title: "New round" };

export default async function NewRoundPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (!usesDatabase() || !isLead(me?.role)) return <RoleNotice title="SEO Watcher" />;
  const watch = await getWatch();
  const header = <PageHeader title="Run a round of checks" subtitle="Where each watched client ranks today, for every keyword in every city." backHref="/growth/watcher" backLabel="SEO Watcher" />;
  if (!watch.ready || !watch.settings) {
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <p className="glass rounded-3xl p-4 text-sm text-muted">{WATCH_SETUP}</p>
      </div>
    );
  }
  const clients = watch.clients
    .filter((c) => c.active)
    .map((c) => {
      const k = watch.keywords.filter((x) => x.clientId === c.id && x.active).length;
      const m = watch.markets.filter((x) => x.clientId === c.id && x.active).length;
      return { id: c.id, name: c.name, pairs: k * m, cities: m };
    });
  const left = Math.max(0, Math.round((watch.settings.capUsd - watch.spentThisMonthUsd) * 100) / 100);
  return (
    <div className="mx-auto max-w-2xl">
      {header}
      <GlassCard className="space-y-3">
        {clients.length === 0 ? (
          <p className="text-sm text-muted">No watched clients yet. Pick some on Watched clients first.</p>
        ) : (
          <StartRoundForm clients={clients} volumes={volumesDue(watch.latestVolumeMonth, nyToday())} leftUsd={left} capUsd={watch.settings.capUsd} />
        )}
      </GlassCard>
      <p className="mt-2 px-1 text-[11px] text-faint">
        Starting a round only writes down its estimate (the database refuses it past the monthly cap). Nothing is fetched until you run the prompt in Claude Code on the next screen.
      </p>
    </div>
  );
}
