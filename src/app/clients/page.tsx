import type { Metadata } from "next";
import { GlassCard } from "@/components/cards/GlassCard";
import { RosterBrowser, type RosterRow } from "@/components/cards/RosterBrowser";
import { Provenance } from "@/components/labels/labels";
import { PageHeader } from "@/components/shell/PageHeader";
import { getRoster, getRosterSummary, getToday, tierOf } from "@/lib/data-source";
import { describeTenure, formatUsdExact } from "@/lib/format";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  const today = getToday();
  const summary = getRosterSummary();
  const rows: RosterRow[] = getRoster().map((c) => ({
    ...c,
    tenure: describeTenure(c.startDate, today),
    tier: tierOf(c.monthlyUsd),
  }));

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${summary.activeCount} active · ${summary.total} total`}
        action={<Provenance kind={summary.source === "private_file" ? "real" : "demo"} />}
      />

      <GlassCard className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-display text-xl font-bold">{formatUsdExact(summary.activeMrr)}</p>
          <p className="text-[11px] text-muted">Active / month</p>
        </div>
        <div>
          <p className="font-display text-xl font-bold text-amber">{formatUsdExact(summary.pausedMrr)}</p>
          <p className="text-[11px] text-muted">{summary.pausedCount} paused</p>
        </div>
        <div>
          <p className="font-display text-xl font-bold">{summary.avgMonthsActive}</p>
          <p className="text-[11px] text-muted">Avg months</p>
        </div>
      </GlassCard>

      {summary.needsCheck > 0 && (
        <p className="mt-3 rounded-2xl border border-amber/30 bg-amber/8 px-3.5 py-2.5 text-xs text-muted">
          <span className="font-semibold text-amber">{summary.needsCheck} records need checking.</span> The two
          client lists disagreed on these. Look for the ⚠ icon, or tap &ldquo;Needs check&rdquo;.
        </p>
      )}

      <div className="mt-5">
        <RosterBrowser clients={rows} />
      </div>

      <p className="mt-6 px-1 text-[11px] text-faint">
        {summary.source === "private_file"
          ? "From your private client file on this Mac. It never goes to Git or GitHub. Billing will verify these numbers once connected."
          : "Demo list. Add private-data/clients.json on this Mac to see your real clients."}
      </p>
    </>
  );
}
