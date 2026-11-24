// Search demand in the SEO Watcher sample (Phase A): monthly Google searches per
// keyword and city, month over month and vs last year.

import type { Metadata } from "next";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { SampleNotice, WATCH_BASE, WatchTabs } from "@/components/watcher/Bits";
import { Bars, Change } from "@/components/watcher/Charts";
import { getMember, getWatchPreview, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { buildDemand } from "@/lib/watch/view";

export const metadata: Metadata = { title: "Search demand (sample)" };

const monthName = (m: string | null) =>
  m ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "";

export default async function WatcherDemandPage() {
  if (usesDatabase() && !isLead((await getMember())?.role)) return <RoleNotice title="SEO Watcher" />;
  const preview = getWatchPreview();
  const rows = buildDemand(preview.data);
  const month = rows[0]?.change.month ?? null;

  return (
    <>
      <PageHeader title="Search demand" subtitle="How many Google searches each keyword gets a month, per city." backHref={WATCH_BASE} backLabel="Board" />
      <SampleNotice />
      <WatchTabs active="Search demand" />
      <SectionTitle aside={monthName(month)}>Keywords by searches</SectionTitle>
      <ul className="glass divide-y divide-line rounded-3xl px-3.5 lg:px-5 xl:grid xl:grid-cols-2 xl:gap-x-8 xl:divide-y-0">
        {rows.map((r) => (
          <li key={`${r.keyword}|${r.marketName}`} className="flex items-center gap-3 py-2.5 xl:border-b xl:border-line">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.keyword}</p>
              <p className="truncate text-[11px] text-muted">
                {r.marketName} · {r.clientName}
              </p>
            </div>
            <Bars values={r.last12} label={`${r.keyword} in ${r.marketName}: searches over the last 12 months`} />
            <div className="w-24 text-right">
              <p className="text-sm font-semibold tabular-nums">{r.change.latest === null ? "not found" : r.change.latest.toLocaleString("en-US")}</p>
              <p className="flex justify-end gap-1.5 text-[10px] text-faint">
                <span>
                  mo <Change pct={r.change.momPct} className="text-[10px]" />
                </span>
              </p>
              <p className="flex justify-end gap-1.5 text-[10px] text-faint">
                <span>
                  yr <Change pct={r.change.yoyPct} className="text-[10px]" />
                </span>
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1 text-[11px] text-faint">
        Real figures will come from Google Ads search volume (DataForSEO), checked once a month, since Google only updates them monthly.
      </p>
    </>
  );
}
