// One watched client (real data). Everyone who may see it gets the rankings; owner and
// managers also edit the keyword, city and competitor lists. Developers only reach the
// clients they work on: the database returns nothing else.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setWatchCompetitor, setWatchKeyword, setWatchMarket } from "@/app/actions";
import { GlassCard } from "@/components/cards/GlassCard";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { RoomLine } from "@/components/watcher/Bits";
import { ClientDetail } from "@/components/watcher/ClientDetail";
import { AddCityForm, AddCompetitorForm, AddKeywordsForm, ImportAuditForm, WatchClientForm } from "@/components/watcher/Forms";
import { getMember, getWatch, getWatchAuditChoices, usesDatabase, type WatchLive } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { roomNotice } from "@/lib/watch/compute";
import { nyToday } from "@/lib/watch/rounds";
import { buildClient } from "@/lib/watch/view";

export const metadata: Metadata = { title: "Watched client" };

const chip = "pressable min-h-9 rounded-lg border border-line px-2.5 text-[11px]";

export default async function WatchedClientPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = usesDatabase() ? await getMember() : null;
  if (!usesDatabase() || (!isLead(me?.role) && me?.role !== "developer")) return <RoleNotice title="SEO Watcher" />;
  const { slug } = await params;
  const watch = await getWatch();
  const client = watch.clients.find((c) => c.slug === slug);
  if (!watch.ready || !client) notFound();
  const view = client.active ? buildClient(watch.data, client.id, nyToday()) : null;

  return (
    <>
      <PageHeader title={client.name} subtitle={`${client.niche} · ${client.domain}${client.active ? "" : " · paused"}`} backHref="/growth/watcher" backLabel="SEO Watcher" />
      {view ? <ClientDetail view={view} side={watch.canEdit ? <Lists watch={watch} clientId={client.id} /> : undefined} /> : watch.canEdit && <Lists watch={watch} clientId={client.id} />}
      {watch.canEdit && (
        <>
          <SectionTitle>Website and niche</SectionTitle>
          <GlassCard>
            <WatchClientForm clientId={client.id} domain={client.domain} niche={client.niche} submitLabel={client.active ? "Save" : "Save and resume watching"} />
          </GlassCard>
        </>
      )}
    </>
  );
}

/** Owner/managers: the three lists, with pause/resume and add forms. */
async function Lists({ watch, clientId }: { watch: WatchLive; clientId: string }) {
  const s = watch.settings!;
  const audits = await getWatchAuditChoices();
  const kws = watch.keywords.filter((k) => k.clientId === clientId);
  const mks = watch.markets.filter((m) => m.clientId === clientId);
  const cps = watch.competitors.filter((c) => c.clientId === clientId);
  const used = { kw: kws.filter((k) => k.active).length, mk: mks.filter((m) => m.active).length, cp: cps.filter((c) => c.active).length };
  const notices = [roomNotice("Keywords", used.kw, s.keywordsPerClient), roomNotice("Cities", used.mk, s.marketsPerClient), roomNotice("Competitors", used.cp, s.competitorsPerClient)].filter((n) => n.level !== "ok");

  return (
    <>
      <SectionTitle aside={`${used.kw}/${s.keywordsPerClient}`}>Keywords</SectionTitle>
      <GlassCard className="space-y-3">
        {kws.length > 0 && (
          <ul className="divide-y divide-line">
            {kws.map((k) => (
              <li key={k.id} className={`flex items-center gap-2 py-1.5 text-sm ${k.active ? "" : "text-faint line-through"}`}>
                <span className="min-w-0 flex-1 truncate">{k.keyword}</span>
                <form action={setWatchKeyword}>
                  <input type="hidden" name="id" value={k.id} />
                  <input type="hidden" name="field" value="money" />
                  <input type="hidden" name="value" value={String(!k.money)} />
                  <button type="submit" aria-pressed={k.money} aria-label={`${k.keyword}: money keyword`} className={`${chip} ${k.money ? "border-lime/50 bg-lime/15 text-lime" : "text-muted"}`}>
                    money
                  </button>
                </form>
                <form action={setWatchKeyword}>
                  <input type="hidden" name="id" value={k.id} />
                  <input type="hidden" name="field" value="active" />
                  <input type="hidden" name="value" value={String(!k.active)} />
                  <button type="submit" className={`${chip} text-muted`}>{k.active ? "Pause" : "Resume"}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddKeywordsForm clientId={clientId} left={Math.max(0, s.keywordsPerClient - used.kw)} />
      </GlassCard>

      <SectionTitle aside={`${used.mk}/${s.marketsPerClient}`}>Cities</SectionTitle>
      <GlassCard className="space-y-3">
        {mks.length > 0 && (
          <ul className="divide-y divide-line">
            {mks.map((m) => (
              <li key={m.id} className={`flex items-center gap-2 py-1.5 text-sm ${m.active ? "" : "text-faint line-through"}`}>
                <span className="min-w-0 flex-1 truncate">
                  {m.city}, {m.state}
                  <span className="ml-1.5 text-[11px] text-faint">{m.lat === null ? "map spot after first round" : "on the map"}</span>
                </span>
                <form action={setWatchMarket}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="active" value={String(!m.active)} />
                  <button type="submit" className={`${chip} text-muted`}>{m.active ? "Pause" : "Resume"}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddCityForm clientId={clientId} left={Math.max(0, s.marketsPerClient - used.mk)} />
      </GlassCard>

      <SectionTitle aside={`${used.cp}/${s.competitorsPerClient}`}>Competitors to track</SectionTitle>
      <GlassCard className="space-y-3">
        {cps.length > 0 && (
          <ul className="divide-y divide-line">
            {cps.map((c) => (
              <li key={c.id} className={`flex items-center gap-2 py-1.5 text-sm ${c.active ? "" : "text-faint line-through"}`}>
                <span className="min-w-0 flex-1 truncate">{c.domain}</span>
                <form action={setWatchCompetitor}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={String(!c.active)} />
                  <button type="submit" className={`${chip} text-muted`}>{c.active ? "Pause" : "Resume"}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddCompetitorForm clientId={clientId} left={Math.max(0, s.competitorsPerClient - used.cp)} />
      </GlassCard>

      {notices.length > 0 && (
        <div className="mt-2.5 space-y-1 px-1">
          {notices.map((n) => (
            <RoomLine key={n.text} notice={n} />
          ))}
          <p className="text-[11px] text-faint">{watch.isOwner ? "You can raise the limits on Watched clients." : "Only the owner can raise the limits."}</p>
        </div>
      )}

      <SectionTitle>Copy from an audit</SectionTitle>
      <GlassCard>
        <ImportAuditForm clientId={clientId} audits={audits} />
      </GlassCard>
    </>
  );
}
