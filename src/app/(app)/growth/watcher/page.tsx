// SEO Watcher home (docs/SEO_WATCHER_PLAN.md). With real data (0027): the board for the
// watched clients. Owner/managers also see the cap, rounds and list room; developers see
// only the clients they work on (the database decides) and never costs.

import { Activity, ListChecks, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GlassCard } from "@/components/cards/GlassCard";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { shortDate, WatchBoard } from "@/components/watcher/Board";
import { RoomLine, WATCH_BASE } from "@/components/watcher/Bits";
import { getMember, getWatch, usesDatabase, type WatchLive } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { roomNotice, WATCH_RULES } from "@/lib/watch/compute";
import { buildBoard } from "@/lib/watch/view";

export const metadata: Metadata = { title: "SEO Watcher" };

export default async function WatcherPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !isLead(me?.role) && me?.role !== "developer") return <RoleNotice title="SEO Watcher" />;
  const watch = usesDatabase() ? await getWatch() : null;
  const header = (
    <PageHeader
      title="SEO Watcher"
      subtitle="Google rankings for your most important clients, like a stock board: trends, biggest movers and rising competitors."
      backHref={me?.role === "developer" ? "/" : "/growth"}
      backLabel={me?.role === "developer" ? "Home" : "Growth"}
    />
  );

  // Demo (no database) or before 0027: explain, and offer the sample.
  if (!watch?.ready) {
    return (
      <div className="lg:max-w-4xl">
        {header}
        <PreviewCard />
        <SectionTitle>Your real Watcher</SectionTitle>
        <div className="glass space-y-2 rounded-3xl p-4 text-sm text-muted lg:p-6">
          <p>
            <span className="font-semibold text-ink">Not set up yet.</span> It needs database update <span className="font-semibold text-ink">0027</span> (run once in Supabase).
            Then you pick the clients to watch and add up to {WATCH_RULES.limits.keywords} keywords, {WATCH_RULES.limits.markets} cities and {WATCH_RULES.limits.competitors} competitors each,
            or copy them from a saved SEO audit.
          </p>
          <p>
            Checks run inside a <span className="font-semibold text-ink">$20 a month</span> cap. When the cap or a list gets to 80%, the Watcher asks you for more room. It never raises anything on its own.
          </p>
        </div>
      </div>
    );
  }

  const active = watch.clients.filter((c) => c.active);
  if (!active.length) {
    return (
      <div className="lg:max-w-4xl">
        {header}
        {watch.canEdit ? (
          <GlassCard href="/growth/watcher/setup" label="Pick the clients to watch" className="space-y-1">
            <p className="flex items-center gap-2 font-semibold">
              <ListChecks aria-hidden className="size-4 text-violet" /> Pick your important clients
            </p>
            <p className="text-sm text-muted">Start with the few that matter most. You can add more any time.</p>
          </GlassCard>
        ) : (
          <p className="glass rounded-3xl p-4 text-sm text-muted">None of the clients you work on are being watched yet.</p>
        )}
        <div className="mt-3">
          <PreviewCard />
        </div>
      </div>
    );
  }

  const board = buildBoard(watch.data);
  const slugs = new Map(watch.clients.map((c) => [c.id, c.slug]));
  return (
    <>
      {header}
      {watch.canEdit && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href="/growth/watcher/rounds/new" className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-violet-deep px-4 text-sm font-semibold">
            <Play aria-hidden className="size-4" /> Run a round of checks
          </Link>
          <Link href="/growth/watcher/setup" className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm">
            <ListChecks aria-hidden className="size-4" /> Watched clients
          </Link>
          <Link href={WATCH_BASE} className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm text-muted">
            <Activity aria-hidden className="size-4" /> Sample preview
          </Link>
        </div>
      )}
      {board.dates.length === 0 && (
        <p className="glass mb-4 rounded-3xl p-4 text-sm text-muted">
          No checks yet.{" "}
          {watch.canEdit ? "Add keywords and cities for each client, then run a round of checks." : "The owner or a manager runs the checks; rankings appear here after the first round."}
        </p>
      )}
      <WatchBoard board={board} clientHref={(id) => `/growth/watcher/c/${slugs.get(id) ?? ""}`} side={watch.canEdit ? <RoomAndRounds watch={watch} /> : undefined} />
    </>
  );
}

function PreviewCard() {
  return (
    <GlassCard href={WATCH_BASE} label="Open the SEO Watcher preview with sample data" className="space-y-1.5">
      <p className="flex items-center gap-2 font-semibold">
        <Activity aria-hidden className="size-4 text-violet" /> Preview with sample data
      </p>
      <p className="text-sm text-muted">Six fictional businesses, six months of made-up weekly checks: the board, a client page, search demand and opportunity markets.</p>
      <p className="text-[11px] text-faint">Fictional. Nothing fetched, $0.</p>
    </GlassCard>
  );
}

/** Owner/managers: the cap, any list getting full (the app asks; it never raises limits), recent rounds. */
function RoomAndRounds({ watch }: { watch: WatchLive }) {
  const s = watch.settings!;
  const lists = watch.clients
    .filter((c) => c.active)
    .flatMap((c) => {
      const kw = watch.keywords.filter((k) => k.clientId === c.id && k.active).length;
      const mk = watch.markets.filter((m) => m.clientId === c.id && m.active).length;
      const cp = watch.competitors.filter((x) => x.clientId === c.id && x.active).length;
      return [roomNotice(`${c.name}: keywords`, kw, s.keywordsPerClient), roomNotice(`${c.name}: cities`, mk, s.marketsPerClient), roomNotice(`${c.name}: competitors`, cp, s.competitorsPerClient)].filter((n) => n.level !== "ok");
    });
  const cap = roomNotice("Watcher cap this month", watch.spentThisMonthUsd, s.capUsd, "usd");
  return (
    <>
      <SectionTitle>Spending and room</SectionTitle>
      <div className="glass space-y-1.5 rounded-3xl p-3.5 lg:p-5">
        <RoomLine notice={cap} />
        {lists.map((n) => (
          <RoomLine key={n.text} notice={n} />
        ))}
        {(cap.level !== "ok" || lists.length > 0) && (
          <p className="text-[11px] text-faint">{watch.isOwner ? "You can raise the cap or limits on Watched clients." : "Only the owner can raise the cap or limits."}</p>
        )}
      </div>
      {watch.runs.length > 0 && (
        <>
          <SectionTitle>Recent rounds</SectionTitle>
          <ul className="glass divide-y divide-line rounded-3xl px-3.5 lg:px-5">
            {watch.runs.slice(0, 4).map((r) => (
              <li key={r.id}>
                <Link href={`/growth/watcher/rounds/${r.id}`} className="pressable flex min-h-11 items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {shortDate(r.createdAt.slice(0, 10))} · {r.pairs} checks
                  </span>
                  <span className={r.status === "attached" ? "text-xs text-lime" : "text-xs text-amber"}>
                    {r.status === "attached" ? `$${(r.actualUsd ?? r.estUsd).toFixed(2)} · done` : `est. $${r.estUsd.toFixed(2)} · waiting for results`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
