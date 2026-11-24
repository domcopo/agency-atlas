// Opportunity markets in the SEO Watcher sample (Phase A): niche × city scored 0–100
// for "how easy would this be to win and rank", with the evidence shown.

import type { Metadata } from "next";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { Basis, SampleNotice, WATCH_BASE, WatchTabs } from "@/components/watcher/Bits";
import { cn } from "@/lib/format";
import { getMember, getWatchPreview, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { rankOpportunities } from "@/lib/watch/view";

export const metadata: Metadata = { title: "Opportunity markets (sample)" };

const tone = (score: number, blocked: boolean) => (blocked ? "text-faint" : score >= 70 ? "text-teal" : score >= 45 ? "text-amber" : "text-muted");

export default async function WatcherOpportunitiesPage() {
  if (usesDatabase() && !isLead((await getMember())?.role)) return <RoleNotice title="SEO Watcher" />;
  const preview = getWatchPreview();
  const ranked = rankOpportunities(preview.opportunities);

  return (
    <>
      <PageHeader title="Opportunity markets" subtitle="Where a business in a niche would be easiest to rank, to help win new clients." backHref={WATCH_BASE} backLabel="Board" />
      <SampleNotice />
      <WatchTabs active="Opportunities" />
      <SectionTitle aside={<Basis>inferred</Basis>}>Best first</SectionTitle>
      <ul className="space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        {ranked.map(({ item, result }) => (
          <li key={item.id} className={cn("glass flex gap-3 rounded-3xl p-3.5 lg:p-5", result.blocked && "opacity-70")}>
            <div className={cn("w-12 shrink-0 text-center font-display text-2xl font-bold tabular-nums", tone(result.score, result.blocked))}>
              {result.blocked ? "—" : result.score}
              <span className="sr-only"> out of 100</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {item.niche} · {item.city}, {item.state}
              </p>
              <p className={cn("mt-0.5 text-xs", result.blocked ? "text-rose" : "text-muted")}>{result.reasons.join(" · ")}</p>
              {result.missing.length > 0 && <p className="mt-0.5 text-[11px] text-faint">Not found (scored 0): {result.missing.join(", ")}</p>}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 px-1 text-[11px] text-faint">
        Scores are guesses from public data: demand, how weak the Maps top 3 is, keyword difficulty, distance and nearby clients. A market where one of our clients
        already works in the same niche is never suggested. &ldquo;Scout this market&rdquo; and &ldquo;Start an audit&rdquo; buttons come with real data (Phase B).
      </p>
    </>
  );
}
