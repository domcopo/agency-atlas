import { BellRing, ChevronRight, HeartPulse, Layers, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import { RoleNotice } from "@/components/shell/RoleNotice";
import Link from "next/link";
import { CopyButton } from "@/components/cards/CopyButton";
import { GlassCard } from "@/components/cards/GlassCard";
import { RosterBrowser, type RosterRow } from "@/components/cards/RosterBrowser";
import { Provenance, healthStyle } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { CHECK_IN_DAYS, getClientHealth, getMember, getOps, getRoster, getRosterSummary, getServiceGroups, getTeam, getToday, getWinBackList, tierOf, usesDatabase } from "@/lib/data-source";
import { OwnerGaps } from "@/components/cards/OwnerGaps";
import { describeTenure, formatDate, formatUsdExact } from "@/lib/format";
import type { HealthLevel } from "@/lib/types";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  if (usesDatabase() && (await getMember())?.role === "developer") return <RoleNotice title="Clients" />;
  const today = getToday();
  const summary = await getRosterSummary();
  const withHealth = (await getRoster()).map((c) => ({ c, h: getClientHealth(c) }));
  const rows: RosterRow[] = withHealth.map(({ c, h }) => ({
    ...c,
    tenure: describeTenure(c.startDate, today),
    tier: tierOf(c.monthlyUsd),
    health: h?.level,
  }));
  const levels: HealthLevel[] = ["healthy", "watch", "at_risk"];
  const current = withHealth.filter(({ h }) => h !== null);
  const checkIns = withHealth
    .filter(({ c, h }) => c.status === "active" && (h?.checkIn.state === "overdue" || h?.checkIn.state === "due_soon"))
    .sort((a, b) => (a.h!.checkIn.due ?? "").localeCompare(b.h!.checkIn.due ?? ""));
  const neverLogged = withHealth.filter(({ c, h }) => c.status === "active" && h?.checkIn.state === "never_logged").length;
  const winBack = await getWinBackList();
  const serviceGroups = await getServiceGroups();
  const ops = await getOps();
  const member = usesDatabase() ? await getMember() : null;
  const staff = (await getTeam()).members.map((m) => ({ id: m.id, name: m.name }));
  const noNextIds = new Set(ops.gaps.noNextAction.map((c) => c.id));
  const gapClients = ops.clients
    .filter((c) => c.status === "active" && (!c.ownerId || noNextIds.has(c.id)))
    .sort((a, b) => Number(Boolean(a.ownerId)) - Number(Boolean(b.ownerId)) || b.monthlyUsd - a.monthlyUsd);

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${summary.activeCount} active · ${summary.total} total`}
        action={<Provenance kind={summary.source !== "demo" ? "real" : "demo"} />}
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

      {member?.role === "owner" && (
        <Link href="/clients/ghl-matches" className="pressable glass mt-3 flex min-h-11 items-center justify-between rounded-2xl px-4 text-sm">
          <span>Match clients to GoHighLevel contacts</span>
          <span className="text-xs text-violet">For call &amp; message times →</span>
        </Link>
      )}

      {ops.ready && (
        <section id="owners" className="scroll-mt-16">
          <SectionTitle aside={`${ops.gaps.noOwner.length} no owner · ${ops.gaps.noNextAction.length} no next action`}>Owners &amp; next steps</SectionTitle>
          <OwnerGaps clients={gapClients} noNextIds={noNextIds} staff={staff} canSetOwner={member?.role === "owner"} />
        </section>
      )}

      <SectionTitle aside={<Layers aria-hidden className="size-4 text-faint" />}>By service</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {serviceGroups
          .filter((g) => g.slug !== "none" || g.clients.length > 0)
          .map((g) => (
            <Link
              key={g.slug}
              href={`/clients/service/${g.slug}`}
              className="pressable glass flex min-h-11 items-center justify-between gap-2 rounded-2xl p-3"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{g.service ?? "Not set"}</span>
                <span className="block text-[11px] text-muted">
                  {g.activeCount} active{g.pausedCount ? ` · ${g.pausedCount} paused` : ""}
                </span>
                <span className="block text-[11px] text-faint">{formatUsdExact(g.activeMrr)}/mo</span>
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />
            </Link>
          ))}
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-faint">Clients with more than one service show in each group.</p>

      <SectionTitle aside={<HeartPulse aria-hidden className="size-4 text-faint" />}>Client health</SectionTitle>
      <GlassCard className="grid grid-cols-3 gap-2 text-center">
        {levels.map((l) => (
          <div key={l}>
            <p className={`font-display text-xl font-bold ${healthStyle[l].text}`}>
              {current.filter(({ h }) => h?.level === l).length}
            </p>
            <p className="text-[11px] text-muted">{healthStyle[l].label}</p>
          </div>
        ))}
      </GlassCard>
      <p className="mt-1.5 px-1 text-[11px] text-faint">
        Active and paused clients. Tap a client to see why. Use the &ldquo;At risk&rdquo; and &ldquo;Watch&rdquo;
        filters below.
      </p>

      <section id="checkins" className="scroll-mt-16">
        <SectionTitle aside={<BellRing aria-hidden className="size-4 text-faint" />}>Check-ins due</SectionTitle>
        <GlassCard padding="none">
          {checkIns.length > 0 ? (
            <ul className="divide-y divide-line">
              {checkIns.map(({ c, h }) => (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="pressable flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 truncate text-sm font-semibold">{c.name}</span>
                    <span className={`shrink-0 text-xs font-semibold ${h!.checkIn.state === "overdue" ? "text-rose" : "text-amber"}`}>
                      {h!.checkIn.state === "overdue" ? "Overdue" : "Due"} {formatDate(h!.checkIn.due!)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted">Nothing due right now.</p>
          )}
          <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
            {neverLogged > 0 && (
              <>
                <span className="font-semibold text-amber">{neverLogged} active clients have no check-in logged.</span>{" "}
                Open a client to log the last time you talked, or answer Atlas asks on Home.{" "}
              </>
            )}
            Rhythm: Ads every {CHECK_IN_DAYS.Ads} days, SEO every {CHECK_IN_DAYS.SEO}, websites every{" "}
            {CHECK_IN_DAYS.Website}.
          </p>
        </GlassCard>
      </section>

      {winBack.length > 0 && (
        <section id="winback" className="scroll-mt-16">
          <SectionTitle aside={<RotateCcw aria-hidden className="size-4 text-faint" />}>Win back</SectionTitle>
          <GlassCard padding="none">
            <ul className="divide-y divide-line">
              {winBack.map(({ client, script }) => (
                <li key={client.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/clients/${client.id}`} className="pressable min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{client.name}</span>
                    <span className="block text-xs text-muted">
                      {formatUsdExact(client.monthlyUsd)}/mo on hold · paused
                    </span>
                  </Link>
                  <CopyButton text={script} label={`Copy win-back message for ${client.name}`} />
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
              {formatUsdExact(summary.pausedMrr)}/mo on hold. &ldquo;Copy&rdquo; copies a short check-in message
              to paste into GoHighLevel or your phone. This app never sends anything.
            </p>
          </GlassCard>
        </section>
      )}

      <div className="mt-4" />
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
        {summary.source !== "demo"
          ? "From your private client file on this Mac. It never goes to Git or GitHub. Billing will verify these numbers once connected."
          : "Demo list. Add private-data/clients.json on this Mac to see your real clients."}
      </p>
    </>
  );
}
