import { GlassCard } from "@/components/cards/GlassCard";
import { Provenance } from "@/components/labels/labels";
import { SectionTitle } from "@/components/shell/PageHeader";
import { formatUsd } from "@/lib/format";
import type { GhlSummary } from "@/lib/types";

/** Live pipeline from the read-only GoHighLevel copy. Shows nothing until a sync has run. */
export function GhlPipelineCard({ ghl }: { ghl: GhlSummary }) {
  if (!ghl.lastSync) return null;
  const synced = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ghl.lastSync.ranAt));
  const tiles = [
    { label: "Open deals", value: String(ghl.open.count), sub: ghl.open.value ? `${formatUsd(ghl.open.value)} value` : "no values set" },
    { label: "New this month", value: String(ghl.newThisMonth), sub: "opportunities added" },
    { label: "Won this month", value: String(ghl.wonThisMonth.count), sub: ghl.wonThisMonth.value ? formatUsd(ghl.wonThisMonth.value) : "—" },
    { label: "Lost this month", value: String(ghl.lostThisMonth), sub: "marked lost" },
    { label: "Calls next 7 days", value: String(ghl.upcoming7), sub: "booked appointments" },
    { label: "No-shows (30 days)", value: String(ghl.noShows30), sub: `${ghl.showed30} showed` },
  ];
  return (
    <>
      <SectionTitle aside={<Provenance kind="real" what="GoHighLevel" />}>Your pipeline</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <GlassCard key={t.label} padding="tight">
            <p className="font-display text-xl font-bold">{t.value}</p>
            <p className="text-[11px] text-muted">{t.label}</p>
            <p className="text-[10px] text-faint">{t.sub}</p>
          </GlassCard>
        ))}
      </div>
      {ghl.byStage.length > 0 && (
        <GlassCard className="mt-2.5">
          <p className="mb-2 text-xs font-semibold text-muted">Open deals by stage</p>
          <ul className="space-y-1.5 text-sm">
            {ghl.byStage.map((s) => (
              <li key={s.stage} className="flex items-center justify-between gap-2">
                <span className="truncate">{s.stage}</span>
                <span className="shrink-0 text-muted">
                  {s.count}
                  {s.value ? ` · ${formatUsd(s.value)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
      <p className="mt-1.5 px-1 text-[11px] text-faint">
        Copied read-only from GoHighLevel{ghl.lastSync.locationName ? ` (${ghl.lastSync.locationName})` : ""} on {synced}. Sync again from Data Safety.
      </p>
    </>
  );
}
