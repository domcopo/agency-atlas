// SEO Watcher: which clients are watched (owner/managers), and the owner's cap and limits.
// Only the important clients are watched; the rest stay off until someone adds them.

import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { setWatchClientActive } from "@/app/actions";
import { GlassCard } from "@/components/cards/GlassCard";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { WatchClientForm, WatchSettingsForm } from "@/components/watcher/Forms";
import { getMember, getWatch, getWatchCandidates, usesDatabase, WATCH_SETUP } from "@/lib/data-source";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "Watched clients" };

export default async function WatcherSetupPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (!usesDatabase() || !isLead(me?.role)) return <RoleNotice title="Watched clients" />;
  const [watch, candidates] = await Promise.all([getWatch(), getWatchCandidates()]);
  const header = <PageHeader title="Watched clients" subtitle="Pick the clients that matter most. Each one costs a little per round of checks." backHref="/growth/watcher" backLabel="SEO Watcher" />;
  if (!watch.ready) {
    return (
      <div className="lg:max-w-3xl">
        {header}
        <p className="glass rounded-3xl p-4 text-sm text-muted">{WATCH_SETUP}</p>
      </div>
    );
  }
  const watched = new Map(watch.clients.map((c) => [c.id, c]));
  const counts = (id: string) => ({
    kw: watch.keywords.filter((k) => k.clientId === id && k.active).length,
    mk: watch.markets.filter((m) => m.clientId === id && m.active).length,
    cp: watch.competitors.filter((c) => c.clientId === id && c.active).length,
  });
  const on = watch.clients.filter((c) => c.active);
  const paused = watch.clients.filter((c) => !c.active);
  const others = candidates.filter((c) => !watched.has(c.id));

  return (
    <div className="lg:max-w-3xl">
      {header}

      <SectionTitle aside={`${on.length} watched`}>Watching</SectionTitle>
      {on.length === 0 ? (
        <p className="glass rounded-3xl p-4 text-sm text-muted">Nobody yet. Pick your most important clients below.</p>
      ) : (
        <ul className="space-y-2">
          {on.map((c) => {
            const n = counts(c.id);
            return (
              <li key={c.id} className="glass flex items-center gap-2 rounded-3xl p-3 lg:p-4">
                <Link href={`/growth/watcher/c/${c.slug}`} className="pressable flex min-h-11 min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {c.domain} · {c.niche} · {n.kw} keywords · {n.mk} cities · {n.cp} competitors
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />
                </Link>
                <form action={setWatchClientActive}>
                  <input type="hidden" name="clientId" value={c.id} />
                  <input type="hidden" name="active" value="false" />
                  <button type="submit" className="pressable min-h-11 rounded-xl border border-line px-3 text-xs text-muted">
                    Pause
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {paused.length > 0 && (
        <>
          <SectionTitle>Paused (history kept)</SectionTitle>
          <ul className="space-y-2">
            {paused.map((c) => (
              <li key={c.id} className="glass flex items-center justify-between gap-2 rounded-3xl p-3 lg:p-4">
                <span className="min-w-0 truncate text-sm">{c.name}</span>
                <form action={setWatchClientActive}>
                  <input type="hidden" name="clientId" value={c.id} />
                  <input type="hidden" name="active" value="true" />
                  <button type="submit" className="pressable min-h-11 rounded-xl border border-line px-3 text-xs">
                    Resume
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle aside={`${others.length} clients`}>Add a client</SectionTitle>
      {others.length === 0 ? (
        <p className="glass rounded-3xl p-4 text-sm text-muted">Every current client is already on the list.</p>
      ) : (
        <ul className="space-y-2">
          {others.map((c) => (
            <li key={c.id}>
              <details className="glass rounded-3xl px-3 lg:px-4">
                <summary className="pressable flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 text-xs font-semibold text-violet">Watch</span>
                </summary>
                <div className="pb-3">
                  <WatchClientForm clientId={c.id} submitLabel="Start watching" />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {watch.settings && (
        <>
          <SectionTitle>Cap and limits</SectionTitle>
          <GlassCard className="space-y-2">
            <p className="text-sm text-muted">
              ${watch.spentThisMonthUsd.toFixed(2)} of ${watch.settings.capUsd.toFixed(2)} used this month. The database refuses any round that would go over.
            </p>
            {watch.isOwner ? (
              <WatchSettingsForm
                capUsd={watch.settings.capUsd}
                keywords={watch.settings.keywordsPerClient}
                markets={watch.settings.marketsPerClient}
                competitors={watch.settings.competitorsPerClient}
              />
            ) : (
              <p className="text-xs text-faint">
                Limits per client: {watch.settings.keywordsPerClient} keywords, {watch.settings.marketsPerClient} cities, {watch.settings.competitorsPerClient} competitors. Only the owner changes these.
              </p>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
