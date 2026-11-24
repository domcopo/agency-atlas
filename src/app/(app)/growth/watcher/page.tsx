// SEO Watcher home. Phase A (docs/SEO_WATCHER_PLAN.md): no real data yet, so this page
// explains what's coming and opens the fictional sample preview.

import { Activity, MapPinned, Radar, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { GlassCard } from "@/components/cards/GlassCard";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { WATCH_BASE } from "@/components/watcher/Bits";
import { getMember, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { WATCH_RULES } from "@/lib/watch/compute";

export const metadata: Metadata = { title: "SEO Watcher" };

export default async function WatcherPage() {
  if (usesDatabase() && !isLead((await getMember())?.role)) return <RoleNotice title="SEO Watcher" />;
  const L = WATCH_RULES.limits;
  return (
    <div className="lg:max-w-4xl">
      <PageHeader
        title="SEO Watcher"
        subtitle="Google rankings for your most important clients, like a stock board: trends, biggest movers, rising competitors and easy markets."
        backHref="/growth"
        backLabel="Growth"
      />

      <GlassCard href={WATCH_BASE} label="Open the SEO Watcher preview with sample data" className="space-y-1.5">
        <p className="flex items-center gap-2 font-semibold">
          <Activity aria-hidden className="size-4 text-violet" /> Preview with sample data
        </p>
        <p className="text-sm text-muted">Six fictional businesses, six months of made-up weekly checks. See the board, a client page, search demand and opportunity markets.</p>
        <p className="text-[11px] text-faint">Fictional. Nothing fetched, $0.</p>
      </GlassCard>

      <SectionTitle>Your real Watcher</SectionTitle>
      <div className="glass space-y-2 rounded-3xl p-4 text-sm text-muted lg:p-6">
        <p>
          <span className="font-semibold text-ink">Not set up yet.</span> It needs database update <span className="font-semibold text-ink">0027</span> (Phase B). Then you pick
          the clients to watch and add up to {L.keywords} keywords, {L.markets} cities and {L.competitors} competitors each, or import them from a saved SEO audit.
        </p>
        <p>
          Checks run weekly inside a <span className="font-semibold text-ink">$20 a month</span> cap. When the cap or a list gets to 80%, the Watcher asks you for more room
          and shows why. It never raises anything on its own.
        </p>
      </div>

      <SectionTitle>Coming next</SectionTitle>
      <ul className="grid gap-2.5 lg:grid-cols-3 lg:gap-4">
        {[
          { icon: Radar, title: "Phase B: real lists", text: "Watched clients, keywords, cities, competitors, audit import, first real checks." },
          { icon: MapPinned, title: "Phase C: USA map", text: "All 50 states with clients, rankings, competitors and opportunity spots." },
          { icon: TrendingUp, title: "Phase D–F", text: "Monthly reports + GBP checklists, the SEO coach, then automatic weekly checks." },
        ].map(({ icon: Icon, title, text }) => (
          <li key={title} className="glass rounded-3xl p-3.5 lg:p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Icon aria-hidden className="size-4 text-teal" /> {title}
            </p>
            <p className="mt-1 text-xs text-muted">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
