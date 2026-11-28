// Clients: a calm screen where client care sees who needs a touch today
// (docs/CLIENTS_JOURNEY_LINE_PLAN.md). Top: title, counts, Add client, a slim money strip
// (amounts owner-only), Today's goal beside Client health. Then the Journey Line (every client
// on the 27 touches), Communications needed (every client's next touch, urgent first), By
// service, the client list, and a collapsible side panel with win-backs and owners. ?view=pipeline opens the full pipeline; ?client=slug opens a client drawer.

import { RiskAlerts } from "@/components/cards/RiskAlerts";
import { BellRing, HeartPulse, Layers, ChevronRight, Plus, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import { canCare, isLead } from "@/lib/roles";
import { RoleNotice } from "@/components/shell/RoleNotice";
import Link from "next/link";
import { CopyButton } from "@/components/cards/CopyButton";
import { GlassCard } from "@/components/cards/GlassCard";
import { RosterBrowser, type RosterRow } from "@/components/cards/RosterBrowser";
import { Provenance, healthStyle } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import {
  CHECK_IN_DAYS,
  getActions,
  getBilling,
  getCareToday,
  getClientCareInfo,
  getClientHealth,
  getJourneys,
  getJourneySteps,
  getMember,
  getOps,
  getRoster,
  getRosterSource,
  getRosterSummary,
  getServiceGroups,
  getTeam,
  getToday,
  getVaRequests,
  getWinBackList,
  getWinLoss,
  tierOf,
  usesDatabase,
} from "@/lib/data-source";
import { OwnerGaps } from "@/components/cards/OwnerGaps";
import { WinLossSection } from "@/components/cards/WinLossSection";
import { cn, describeTenure, formatDate, formatShortDate, formatUsdExact } from "@/lib/format";
import { byImportance } from "@/lib/ops";
import { CareGoalCard, GrowthLine } from "@/components/cards/CareWidgets";
import { activeByMonth } from "@/lib/care";
import { deliverableLabel, draftMessage, STATUS_REASONS, touchByStep } from "@/lib/journey";
import { actionCards, filterClients, lineLayout, LONG_STAGES, longLineLayout, longStageCounts, parsePipelineFilters, pipelineGroups, placeDots, placeLongDots, stageCounts, type DotCluster, type LineClient } from "@/lib/journey-line";
import { journeyRow } from "@/lib/journey-view";
import { JourneyLine, JourneyLegend } from "@/components/clients/JourneyLine";
import { ActionCards, type ActionCardView } from "@/components/clients/ActionCards";
import { SidePanel } from "@/components/clients/SidePanel";
import { ClientDrawer, PipelineOverlay } from "@/components/clients/Overlay";
import { PipelineBody, pipelineQuery } from "@/components/clients/PipelineBody";
import { ClientDrawerBody } from "@/components/clients/ClientDrawerBody";
import type { HealthLevel } from "@/lib/types";

export const metadata: Metadata = { title: "Clients" };

type Params = Record<string, string | undefined>;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const stageParam = Number(params.stage);
  const activeStage = Number.isInteger(stageParam) && stageParam >= 0 && stageParam <= 5 ? stageParam : null;
  if (usesDatabase() && !canCare((await getMember())?.role)) return <RoleNotice title="Clients" />;
  const today = getToday();
  const summary = await getRosterSummary();
  const { actions } = await getActions();
  const withHealth = (await getRoster()).map((c) => ({ c, h: getClientHealth(c, actions) }));
  // Owner only (null for everyone else; the database also returns them nothing).
  const billing = await getBilling();
  const [winLoss, rosterSource, journeys, { steps }, careInfo] = await Promise.all([getWinLoss(6), getRosterSource(), getJourneys(), getJourneySteps(), getClientCareInfo()]);
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
  const lead = Boolean(member && isLead(member.role));
  const staff = (await getTeam()).members.map((m) => ({ id: m.id, name: m.name }));
  const noNextIds = new Set(ops.gaps.noNextAction.map((c) => c.id));
  const gapClients = ops.clients
    .filter((c) => c.status === "active" && (!c.ownerId || noNextIds.has(c.id)))
    .sort((a, b) => Number(Boolean(a.ownerId)) - Number(Boolean(b.ownerId)) || byImportance(a, b));
  const money = summary.moneyShown;
  const growth = activeByMonth(withHealth.map(({ c }) => c), today, 12);
  const goal = await getCareToday();

  // Journey Line + action cards: active clients, most important first.
  const active = withHealth.filter(({ c }) => c.status === "active").sort((a, b) => byImportance(a.c, b.c));
  const lineClients: LineClient[] = active.map(({ c, h }) => ({
    slug: c.id,
    name: c.name,
    services: c.services,
    ownerId: c.ownerId,
    ownerName: c.ownerName,
    backupId: c.backupId,
    vip: c.vip,
    health: h?.level,
    ghl: c.ghl,
    lastLogged: c.lastLogged,
    startDate: c.startDate,
  }));
  const layout = lineLayout(steps);
  const clusters = journeys.ready ? placeDots(lineClients, journeys.bySlug, steps, today) : [];
  const counts = stageCounts(clusters);
  const dots = clusters.flatMap((cl) => cl.dots);
  const totals = { overdue: dots.filter((d) => d.timing === "overdue").length, today: dots.filter((d) => d.timing === "today").length, reached: dots.filter((d) => d.reachedOut).length };
  const requests = lead ? (await getVaRequests()).filter((r) => r.status === "waiting") : [];
  const reasonLabel = (r: string) => (r === "back" ? "Back to active" : (STATUS_REASONS.find(([k]) => k === r)?.[1] ?? "Other"));
  const bySlug = new Map(active.map(({ c }) => [c.id, c]));
  const cards: ActionCardView[] = journeys.ready
    ? actionCards({
        clients: lineClients,
        journeys: journeys.bySlug,
        steps,
        risks: ops.risks.map((r) => ({ slug: r.client.slug, problem: r.problem, severity: r.severity })),
        requests: requests.map((r) => ({ id: r.id, slug: r.slug, to: r.to, reasonLabel: reasonLabel(r.reason) })),
        today,
        formatDay: formatDate,
        upcoming: true,
      }).map((card) => {
        const c = bySlug.get(card.slug);
        const t = card.step !== null ? touchByStep(card.step, steps) : undefined;
        return {
          ...card,
          clientDbId: journeys.sample ? null : (c?.dbId ?? null),
          draft: t && c ? draftMessage(t, c.name) : null,
          say: t?.say ?? null,
          noTexts: Boolean(c?.dbId && careInfo.byClient.get(c.dbId)?.noTexts),
        };
      })
    : [];

  // Overlay and drawer, from the address bar.
  const filters = parsePipelineFilters(params);
  const pipelineOpen = params.view === "pipeline" && journeys.ready;
  const drawerSlug = typeof params.client === "string" ? params.client : null;
  const drawerClient = drawerSlug ? withHealth.find(({ c }) => c.id === drawerSlug)?.c : undefined;
  const pipelineHref = pipelineQuery(filters);
  const clientHref = pipelineOpen ? `${pipelineQuery(filters)}&client=` : "/clients?client=";

  // The bigger long-term line in the full pipeline: the 27 touches, then months as a client
  // out to 2+ years. Uses the same filters as the lists below it.
  const dotsFor = (cls: DotCluster[], key: (cl: DotCluster) => string) =>
    cls.map((cl) => ({
      key: cl.key,
      x: cl.x,
      title: key(cl),
      dots: cl.dots.map((d) => ({
        slug: d.slug,
        name: d.name,
        initials: d.initials,
        timing: d.timing,
        reachedOut: d.reachedOut,
        dueLabel: `${cl.stage >= 5 ? `${d.touchTitle}, ` : ""}${d.timing === "overdue" ? "since" : "due"} ${formatShortDate(d.due)}`,
      })),
    }));
  const tickInfo = (t: { step: number; stage: number; x: number }) => {
    const touch = touchByStep(t.step, steps)!;
    return { ...t, title: touch.title, how: touch.how, channel: touch.channel, day: touch.day, deliverable: deliverableLabel(touch.deliverable) };
  };
  const longView = pipelineOpen
    ? (() => {
        const l = longLineLayout(steps);
        const cls = placeLongDots(filterClients(lineClients, filters), journeys.bySlug, steps, today)
          .map((cl) => (filters.overdueOnly ? { ...cl, dots: cl.dots.filter((d) => d.timing === "overdue") } : cl))
          .filter((cl) => cl.dots.length > 0);
        const n = longStageCounts(cls);
        const markTitle = new Map(l.marks.map((m) => [m.key, m.label]));
        return {
          segments: l.segments.map((s) => ({ ...s, ...n[s.stage]! })),
          ticks: [
            ...l.ticks.map(tickInfo),
            ...l.marks.map((m) => ({
              step: 1000 + m.month,
              stage: m.stage,
              x: m.x,
              mark: true,
              title: m.month > 24 ? "More than 2 years as a client" : `Month ${m.month} as a client`,
              how: "Grow: the monthly rhythm (report, check-in, Google profile). Clients sit here by how long they've been a client.",
            })),
          ],
          clusters: dotsFor(cls, (cl) => (markTitle.has(cl.key) ? `${markTitle.get(cl.key)} as a client` : `Touch ${cl.key} · ${cl.dots[0]!.touchTitle}`)),
        };
      })()
    : null;

  const sidePanel = (
    <SidePanel summary={`${winBack.length} to win back${ops.ready ? ` · ${ops.gaps.noOwner.length} no owner` : ""}`}>
      {winBack.length > 0 && (
        <section id="winback" className="scroll-mt-16">
          <SectionTitle aside={<RotateCcw aria-hidden className="size-4 text-faint" />}>Win back</SectionTitle>
          <GlassCard padding="none">
            <ul className="divide-y divide-line">
              {winBack.map(({ client, script }) => (
                <li key={client.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/clients/${client.id}`} className="pressable min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{client.name}</span>
                    <span className="block text-xs text-muted">{client.monthlyUsd === null ? "Paused" : `${formatUsdExact(client.monthlyUsd)}/mo on hold · paused`}</span>
                  </Link>
                  <CopyButton text={script} label={`Copy win-back message for ${client.name}`} />
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
              {money ? `${formatUsdExact(summary.pausedMrr)}/mo on hold. ` : ""}&ldquo;Copy&rdquo; copies a short check-in message to paste into GoHighLevel or your phone. This app never sends anything.
            </p>
          </GlassCard>
        </section>
      )}

      {ops.ready && (
        <section id="owners" className="scroll-mt-16">
          <SectionTitle aside={`${ops.gaps.noOwner.length} no owner · ${ops.gaps.noNextAction.length} no next action`}>Owners &amp; next steps</SectionTitle>
          <OwnerGaps clients={gapClients} noNextIds={noNextIds} staff={staff} canSetOwner={member?.role === "owner"} />
        </section>
      )}
    </SidePanel>
  );

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${summary.activeCount} active · ${summary.total} total`}
        action={
          <span className="flex items-center gap-3">
            <GrowthLine points={growth} />
            {usesDatabase() && member && isLead(member.role) ? (
              <Link href="/clients/new" className="pressable flex min-h-11 items-center gap-1 rounded-2xl bg-violet-deep px-3 text-xs font-semibold text-white">
                <Plus aria-hidden className="size-4" /> Add client
              </Link>
            ) : (
              <Provenance kind={summary.source !== "demo" ? "real" : "demo"} />
            )}
          </span>
        }
      />

      {/* Slim money strip. Amounts only for the owner; everyone else sees counts, never "$0". */}
      <dl className="glass flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 rounded-2xl px-4 py-2.5 sm:justify-start">
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">{money ? "Active per month" : "Active"}</dt>
          <dd className="font-display text-lg font-bold">{money ? formatUsdExact(summary.activeMrr) : summary.activeCount}</dd>
          <span aria-hidden className="text-[11px] text-muted">
            {money ? "active / month" : "active"}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Paused</dt>
          <dd className="font-display text-lg font-bold text-amber">{money ? formatUsdExact(summary.pausedMrr) : summary.pausedCount}</dd>
          <span aria-hidden className="text-[11px] text-muted">{summary.pausedCount} paused</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Average months active</dt>
          <dd className="font-display text-lg font-bold">{summary.avgMonthsActive}</dd>
          <span aria-hidden className="text-[11px] text-muted">avg months</span>
        </div>
      </dl>

      {/* Setup screens (owner; managers get the steps editor). */}
      {member && lead && (
        <nav aria-label="Client setup" className="mt-2 flex flex-wrap gap-1.5">
          {(
            [
              ["/clients/journey", "Journey steps", true],
              ["/clients/setup", "Set up clients", false],
              ["/clients/plans", "Plan tiers", false],
              ["/clients/restart", "Restart · place · goals", false],
              ["/clients/ghl-matches", "Match GoHighLevel contacts", false],
            ] as const
          )
            .filter(([, , managers]) => member.role === "owner" || managers)
            .map(([href, label]) => (
              <Link key={href} href={href} className="pressable flex min-h-9 items-center rounded-xl border border-line bg-white/[0.03] px-2.5 text-[11px] font-semibold text-violet">
                {label}
              </Link>
            ))}
        </nav>
      )}


      {/* Today's goal beside Client health. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {goal ? (
          member?.role === "owner" ? (
            <Link href="/clients/restart" aria-label="Today's goal (change goals on Restart · place · goals)" className="pressable block">
              <CareGoalCard {...goal} />
            </Link>
          ) : (
            <CareGoalCard {...goal} />
          )
        ) : null}
        <section aria-labelledby="health-h" className={cn("glass rounded-3xl p-3.5", !goal && "sm:col-span-2")}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="health-h" className="text-sm font-semibold">
              Client health
            </h2>
            <HeartPulse aria-hidden className="size-4 text-faint" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            {levels.map((l) => (
              <a key={l} href="#list" className="pressable rounded-2xl border border-line py-2">
                <p className={`font-display text-xl font-bold ${healthStyle[l].text}`}>{current.filter(({ h }) => h?.level === l).length}</p>
                <p className="text-[11px] text-muted">{healthStyle[l].label}</p>
              </a>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">Active and paused clients. Use the &ldquo;At risk&rdquo; and &ldquo;Watch&rdquo; filters in the list.</p>
        </section>
      </div>

      <div className="lg:flex lg:items-start lg:gap-6">
        <div className="min-w-0 flex-1">
          {journeys.ready ? (
            <>
              <section aria-labelledby="line-h" className="glass mt-4 rounded-3xl px-3 pb-3 pt-3.5 sm:px-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h2 id="line-h" className="text-sm font-semibold">
                    Journey line
                    {journeys.sample && <span className="ml-2 text-[11px] font-normal text-amber">sample clients (demo)</span>}
                  </h2>
                  <Link href={pipelineHref} scroll={false} className="pressable flex min-h-9 items-center rounded-xl border border-violet/40 px-3 text-[11px] font-semibold text-violet">
                    Open full pipeline
                  </Link>
                </div>
                <p className="mb-2 text-[11px] text-muted" aria-live="polite">
                  <span className={cn(totals.overdue > 0 && "font-semibold text-rose")}>{totals.overdue} overdue</span> ·{" "}
                  <span className={cn(totals.today > 0 && "font-semibold text-amber")}>{totals.today} due today</span> ·{" "}
                  <span className={cn(totals.reached > 0 && "font-semibold text-violet")}>{totals.reached} reached out</span> · {dots.length} on the line
                </p>
                <JourneyLine
                  segments={layout.segments.map((s) => ({ ...s, ...counts[s.stage]! }))}
                  ticks={layout.ticks.map(tickInfo)}
                  clusters={dotsFor(clusters, (cl) => (cl.key === "grow" ? "Grow (the ongoing monthly rhythm)" : `Touch ${cl.key} · ${cl.dots[0]!.touchTitle}`))}
                  pipelineHref={pipelineHref}
                  clientHref={clientHref}
                />
                <div className="mt-2">
                  <JourneyLegend />
                </div>
              </section>

              <ActionCards cards={cards} clientHref={clientHref} staffId={member?.staffId ?? null} />
            </>
          ) : (
            <>
              {/* Before the journey setup (0028): the old risk alerts and check-ins. */}
              {usesDatabase() && (
                <section id="risk" className="scroll-mt-16">
                  <SectionTitle aside={`${ops.risks.length} ${ops.risks.length === 1 ? "client" : "clients"}`}>Risk alerts</SectionTitle>
                  <RiskAlerts alerts={ops.risks} historyReady={ops.historyReady} />
                </section>
              )}
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
                    {neverLogged > 0 && <span className="font-semibold text-amber">{neverLogged} active clients have no check-in logged. </span>}
                    Rhythm: Ads every {CHECK_IN_DAYS.Ads} days, SEO every {CHECK_IN_DAYS.SEO}, websites every {CHECK_IN_DAYS.Website}.
                  </p>
                </GlassCard>
              </section>
            </>
          )}


          <section aria-label="By service" className="mt-2">
            <SectionTitle aside={<Layers aria-hidden className="size-4 text-faint" />}>By service</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {serviceGroups
                .filter((g) => g.slug !== "none" || g.clients.length > 0)
                .map((g) => (
                  <Link key={g.slug} href={`/clients/service/${g.slug}`} className="pressable glass flex min-h-11 items-center justify-between gap-2 rounded-2xl p-3">
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

          </section>

          {summary.needsCheck > 0 && (
            <p className="mt-4 rounded-2xl border border-amber/30 bg-amber/8 px-3.5 py-2.5 text-xs text-muted">
              <span className="font-semibold text-amber">{summary.needsCheck} records need checking.</span> The two client lists disagreed on these. Look for the ⚠ icon, or tap &ldquo;Needs check&rdquo;.
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
        </div>

        {sidePanel}
      </div>

      {pipelineOpen && (
        <PipelineOverlay title="Full pipeline" closeHref="/clients">
          {longView && (
            <section aria-labelledby="long-h" className="glass mx-auto mb-4 max-w-[100rem] rounded-3xl px-3 pb-3 pt-3.5 sm:px-4">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="long-h" className="text-sm font-semibold">
                  Long-term journey line
                  {journeys.sample && <span className="ml-2 text-[11px] font-normal text-amber">sample clients (demo)</span>}
                </h3>
                <p className="text-[11px] text-faint">First 90 days by touch, then Grow by months as a client: {LONG_STAGES.join(" · ")}</p>
              </div>
              <div className="-mx-1 overflow-x-auto px-1 pb-44 lg:overflow-visible lg:pb-0">
                <div className="min-w-[960px]">
                  <JourneyLine large segments={longView.segments} ticks={longView.ticks} clusters={longView.clusters} pipelineHref={pipelineHref} clientHref={clientHref} />
                </div>
              </div>
              <div className="mt-2">
                <JourneyLegend />
              </div>
            </section>
          )}
          <PipelineBody stages={pipelineGroups(lineClients, journeys.bySlug, steps, today, filters)} filters={filters} staff={staff} sample={journeys.sample} />
        </PipelineOverlay>
      )}
      {drawerClient && (
        <ClientDrawer title={drawerClient.name} closeHref={pipelineOpen ? pipelineHref : "/clients"}>
          <ClientDrawerBody client={drawerClient} journey={journeys.bySlug.get(drawerClient.id)} steps={steps} today={today} sample={journeys.sample} />
        </ClientDrawer>
      )}
    </>
  );
}
