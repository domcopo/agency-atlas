import { RiskAlerts } from "@/components/cards/RiskAlerts";
import { BellRing, ChevronRight, HeartPulse, Layers, Plus, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import { isLead } from "@/lib/roles";
import { RoleNotice } from "@/components/shell/RoleNotice";
import Link from "next/link";
import { CopyButton } from "@/components/cards/CopyButton";
import { GlassCard } from "@/components/cards/GlassCard";
import { RosterBrowser, type RosterRow } from "@/components/cards/RosterBrowser";
import { Provenance, healthStyle } from "@/components/labels/labels";
import { Column, Columns } from "@/components/shell/Columns";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { CHECK_IN_DAYS, getActions, getBilling, getClientHealth, getMember, getOps, getRoster, getRosterSource, getRosterSummary, getServiceGroups, getTeam, getToday, getWinBackList, getWinLoss, tierOf, usesDatabase } from "@/lib/data-source";
import { OwnerGaps } from "@/components/cards/OwnerGaps";
import { WinLossSection } from "@/components/cards/WinLossSection";
import { describeTenure, formatDate, formatUsdExact } from "@/lib/format";
import { byImportance } from "@/lib/ops";
import { CareGoalCard, GrowthLine, JourneyBoard } from "@/components/cards/CareWidgets";
import { activeByMonth } from "@/lib/care";
import { touchesDue } from "@/lib/journey";
import { getCareToday } from "@/lib/data-source";
import { getJourneys } from "@/lib/data-source";
import { journeyRow } from "@/lib/journey-view";
import type { HealthLevel } from "@/lib/types";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const stageParam = Number((await searchParams).stage);
  const activeStage = Number.isInteger(stageParam) && stageParam >= 0 && stageParam <= 5 ? stageParam : null;
  if (usesDatabase() && !isLead((await getMember())?.role)) return <RoleNotice title="Clients" />;
  const today = getToday();
  const summary = await getRosterSummary();
  const { actions } = await getActions();
  const withHealth = (await getRoster()).map((c) => ({ c, h: getClientHealth(c, actions) }));
  // Owner only (null for everyone else; the database also returns them nothing).
  const billing = await getBilling();
  const [winLoss, rosterSource, journeys] = await Promise.all([getWinLoss(6), getRosterSource(), getJourneys()]);
  const rows: RosterRow[] = withHealth.map(({ c, h }) => ({
    ...c,
    tenure: describeTenure(c.startDate, today),
    tier: tierOf(c.monthlyUsd),
    health: h?.level,
    billing: billing?.byClient.get(c.id)?.chip ?? null,
    billingDetail: billing?.byClient.get(c.id)?.detail ?? null,
    journey: journeyRow(journeys.bySlug.get(c.id)),
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
    .sort((a, b) => Number(Boolean(a.ownerId)) - Number(Boolean(b.ownerId)) || byImportance(a, b));
  const money = summary.moneyShown;
  // Journey (0028) and today's goal (0030): hidden until those setup steps are run.
  const allClients = withHealth.map(({ c }) => c);
  const growth = activeByMonth(allClients, today, 12);
  const stageCounts = [0, 0, 0, 0, 0, 0];
  for (const j of journeys.bySlug.values()) stageCounts[j.stage]! += 1;
  const nexts = [...journeys.bySlug.values()].map((j) => j.next).filter((n) => n !== null);
  const due = journeys.ready ? touchesDue(allClients.filter((c) => c.status === "active"), journeys.bySlug, null, today) : [];
  const goal = await getCareToday();

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${summary.activeCount} active · ${summary.total} total`}
        action={
          <span className="flex items-center gap-3">
            <GrowthLine points={growth} />
            {usesDatabase() && member && isLead(member.role) ? (
              <Link href="/clients/new" className="pressable flex min-h-11 items-center gap-1 rounded-2xl bg-violet-deep px-3 text-xs font-semibold">
                <Plus aria-hidden className="size-4" /> Add client
              </Link>
            ) : (
              <Provenance kind={summary.source !== "demo" ? "real" : "demo"} />
            )}
          </span>
        }
      />

      {journeys.ready && (
        <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-x-8 xl:gap-x-10">
          <JourneyBoard counts={stageCounts} overdue={nexts.filter((n) => n.overdue).length} dueToday={nexts.filter((n) => n.due === today).length} active={activeStage} />
          {goal && <CareGoalCard {...goal} />}
        </div>
      )}

      <GlassCard className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-display text-xl font-bold lg:text-3xl">{money ? formatUsdExact(summary.activeMrr) : summary.activeCount}</p>
          <p className="text-[11px] text-muted">{money ? "Active / month" : "Active"}</p>
        </div>
        <div>
          <p className="font-display text-xl font-bold text-amber lg:text-3xl">{money ? formatUsdExact(summary.pausedMrr) : summary.pausedCount}</p>
          <p className="text-[11px] text-muted">{summary.pausedCount} paused</p>
        </div>
        <div>
          <p className="font-display text-xl font-bold lg:text-3xl">{summary.avgMonthsActive}</p>
          <p className="text-[11px] text-muted">Avg months</p>
        </div>
      </GlassCard>

      {/* The owner's setup screens, in one row of small buttons. */}
      {member?.role === "owner" && (
        <nav aria-label="Client setup" className="mt-2.5 flex flex-wrap gap-2">
          {([
            ["/clients/setup", "Set up clients"],
            ["/clients/plans", "Plan tiers"],
            ["/clients/restart", "Restart journeys · goals"],
            ["/clients/ghl-matches", "Match GoHighLevel contacts"],
          ] as const).map(([href, label]) => (
            <Link key={href} href={href} className="pressable flex min-h-10 items-center rounded-xl border border-line bg-white/[0.03] px-3 text-xs font-semibold text-violet">
              {label}
            </Link>
          ))}
        </nav>
      )}

      {/* Wide screens: risks and owners on the left; services, health, check-ins and win-backs on the right. */}
      <Columns single={!usesDatabase() && !ops.ready}>
      <Column>

      {usesDatabase() && (
        <section id="risk" className="scroll-mt-16">
          <SectionTitle aside={`${ops.risks.length} ${ops.risks.length === 1 ? "client" : "clients"}`}>Risk alerts</SectionTitle>
          <RiskAlerts alerts={ops.risks} historyReady={ops.historyReady} />
        </section>
      )}

      {ops.ready && (
        <section id="owners" className="scroll-mt-16">
          <SectionTitle aside={`${ops.gaps.noOwner.length} no owner · ${ops.gaps.noNextAction.length} no next action`}>Owners &amp; next steps</SectionTitle>
          <OwnerGaps clients={gapClients} noNextIds={noNextIds} staff={staff} canSetOwner={member?.role === "owner"} />
        </section>
      )}

      </Column>
      <Column>
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
                {money && <span className="block text-[11px] text-faint">{formatUsdExact(g.activeMrr)}/mo</span>}
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

      {journeys.ready ? (
        <section id="checkins" className="scroll-mt-16">
          <SectionTitle aside={`${due.length} today or overdue`}>Touches due</SectionTitle>
          <GlassCard padding="none">
            {due.length > 0 ? (
              <ul className="divide-y divide-line">
                {due.slice(0, 12).map((t) => (
                  <li key={t.slug}>
                    <Link href={`/clients/${t.slug}`} className="pressable flex items-center justify-between gap-3 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{t.name}</span>
                        <span className="block truncate text-[11px] text-muted">{t.title}</span>
                      </span>
                      <span className={`shrink-0 text-xs font-semibold ${t.overdue ? "text-rose" : "text-amber"}`}>{t.overdue ? `Since ${formatDate(t.due)}` : "Today"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-muted">Nothing due today.</p>
            )}
            <p className="border-t border-line px-4 py-2 text-[11px] text-faint">From each client&apos;s journey: the 27 first-90-day touches, then the monthly rhythm.</p>
          </GlassCard>
        </section>
      ) : (
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
      )}

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
                      {client.monthlyUsd === null ? "Paused" : `${formatUsdExact(client.monthlyUsd)}/mo on hold · paused`}
                    </span>
                  </Link>
                  <CopyButton text={script} label={`Copy win-back message for ${client.name}`} />
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
              {money ? `${formatUsdExact(summary.pausedMrr)}/mo on hold. ` : ""}&ldquo;Copy&rdquo; copies a short check-in message
              to paste into GoHighLevel or your phone. This app never sends anything.
            </p>
          </GlassCard>
        </section>
      )}
      </Column>
      </Columns>

      <div className="mt-4" />
      {summary.needsCheck > 0 && (
        <p className="mt-3 rounded-2xl border border-amber/30 bg-amber/8 px-3.5 py-2.5 text-xs text-muted">
          <span className="font-semibold text-amber">{summary.needsCheck} records need checking.</span> The two
          client lists disagreed on these. Look for the ⚠ icon, or tap &ldquo;Needs check&rdquo;.
        </p>
      )}

      <div id="list" className="mt-5 scroll-mt-16">
        <RosterBrowser clients={rows} showMoney={money} stage={activeStage} />
      </div>

      <WinLossSection winLoss={winLoss} real={rosterSource !== "demo"} />

      <p className="mt-6 px-1 text-[11px] text-faint">
        {summary.source !== "demo"
          ? money
            ? "Monthly amounts are your plan amounts, not payments, and only you can see them. Payment status comes from Billing."
            : "Plan tiers come from the owner. Amounts are owner-only."
          : "Demo list. Add private-data/clients.json on this Mac to see your real clients."}
      </p>
    </>
  );
}
