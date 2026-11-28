// Work. Developers (and the owner or a manager previewing one) get their own work-first
// screen, unchanged. The owner and managers get the Work hub (docs/WORK_HUB_PLAN.md):
// one page for all work, with chips, filters, saved views, a compact grouped list, and
// List | Board | Team views. The old Work orders page (/work/orders) redirects here.

import { Award } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PriorityList } from "@/components/cards/ActionRow";
import { CopyButton } from "@/components/cards/CopyButton";
import { DeveloperContacts } from "@/components/cards/DeveloperContacts";
import { DeveloperWork } from "@/components/cards/DeveloperWork";
import { GlassCard } from "@/components/cards/GlassCard";
import { WorkOrderBoard, type BoardCard } from "@/components/cards/WorkOrderBoard";
import { WorkOrderCard } from "@/components/cards/WorkOrderCard";
import { Pill, Provenance } from "@/components/labels/labels";
import { CARD_GRID, Column, Columns } from "@/components/shell/Columns";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { FilterBar } from "@/components/work/FilterBar";
import { StatChips, WorkHeader } from "@/components/work/WorkHeader";
import { WorkList } from "@/components/work/WorkList";
import { WorkDrawer } from "@/components/work/WorkDrawer";
import { WorkMore } from "@/components/work/WorkMore";
import { SmartAddPopup, SuggestionsPopup } from "@/components/work/WorkPopups";
import { TeamView } from "@/components/work/TeamView";
import { HubShortcuts, ShortcutHint, ShortcutsPopup } from "@/components/work/HubShortcuts";
import { UndoToast } from "@/components/work/UndoToast";
import { clientLabel } from "@/lib/agency";
import { getAiStatus, getDeveloperViewer, getDeveloperWork, getMember, getMyClientContacts, getOps, getSampleDevelopers, getStepsReady, getSuggestionDismissals, getTeam, getToday, getWorkOrderDrafts, getWorkOrders, getWorkRules, showsSamples, usesDatabase } from "@/lib/data-source";
import { cn } from "@/lib/format";
import { draftAdded, promiseMissed, suggestWorkOrders, workloadRows, workOrderGroups, workOrdersAsText } from "@/lib/ops";
import { canPreview } from "@/lib/preview";
import { isLead } from "@/lib/roles";
import type { ClientAction } from "@/lib/types";
import { chipCounts, doneThisWeek, dueHint, groupForList, hubHref, HUB_TYPES, initials, inScope, matchesChip, parseHubFilters, savedViews, teamLoad, withoutDismissed, type HubParams } from "@/lib/work-hub";

export const metadata: Metadata = { title: "Work" };

type Search = HubParams & { new?: string; suggest?: string; founder?: string; keys?: string };

export default async function WorkPage({ searchParams }: { searchParams: Promise<Search> }) {
  const today = getToday();
  const samples = showsSamples();
  const member = usesDatabase() ? await getMember() : null;
  // Developers, or the owner/a manager previewing one (look only): the work-first screen.
  const dev = await getDeveloperViewer();
  if (dev) {
    const [items, contacts, stepsReady] = await Promise.all([getDeveloperWork(), getMyClientContacts(), getStepsReady()]);
    const mine = items.map((i) => i.action!).filter(Boolean);
    return (
      <>
        <PageHeader title="Work" subtitle={dev.preview ? `${dev.name}'s work orders, issues and follow-ups` : "Your work orders, issues and follow-ups"} action={dev.preview ? undefined : <a href="/account" className="pressable glass flex min-h-11 items-center rounded-2xl px-3 text-xs font-semibold">Account</a>} />
        {dev.staffId ? (
          <Columns layout="main">
            <Column>
            <DeveloperWork items={mine} today={today} readOnly={dev.preview} stepsReady={stepsReady} />
            <p className="mt-2 px-1 text-[11px] text-faint">
              Stuck? Say on what, so a manager can help. Ask a manager to change steps or dates.{" "}
              {!dev.preview && (
                <Link href="/notifications" className="font-semibold text-violet">
                  Notices &amp; mute
                </Link>
              )}
            </p>
            </Column>
            <Column>
            <DeveloperContacts contacts={contacts} today={today} />
            </Column>
          </Columns>
        ) : (
          <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Your login isn&apos;t linked to your team profile yet. Ask the owner to link it.</p>
        )}
      </>
    );
  }
  // Salespeople and VAs don't use Work (the database returns them no client work either).
  if (usesDatabase() && !isLead(member?.role)) return <RoleNotice title="Work" />;

  const [ops, team] = await Promise.all([getOps(), getTeam()]);
  const staff = team.members.map((m) => ({ id: m.id, name: m.name }));
  const manager = Boolean(member && isLead(member.role));
  const isOwner = member?.role === "owner";
  const sp = await searchParams;
  const f = parseHubFilters(sp, { staffIds: staff.map((m) => m.id), clientSlugs: ops.clients.map((c) => c.id) });
  const leadName = (a: ClientAction) => (a.leadGhlId ? ops.leadNames.get(a.leadGhlId) : undefined);

  // The items in view (person, client, type, priority, search), then the chip on top.
  const scope = inScope(ops.actions, f, leadName);
  const counts = chipCounts(scope, ops.today);
  const listed = f.chip ? scope.filter((a) => matchesChip(a, f.chip!, ops.today)) : scope;
  const groups = groupForList(listed, ops.today);
  const done = f.chip ? [] : doneThisWeek(scope, ops.today);
  const openCount = Object.values(groups).reduce((n, g) => n + g.length, 0);
  const filtered = Boolean(f.q || f.chip || f.who !== undefined || f.client || f.type || f.prio);

  const filterClients = ops.clients.filter((c) => c.status !== "canceled").sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ slug: c.id, name: c.name }));
  const formClients = ops.clients.filter((c) => c.dbId && c.status !== "canceled").sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ slug: c.id, name: c.name }));
  const workload = workloadRows({ actions: ops.actions, staff, today: ops.today });
  const suggestions = manager && ops.orders ? suggestWorkOrders({ clients: ops.clients, risks: ops.risks, actions: [...ops.actions, ...ops.canceled], team: team.members, workload, today: ops.today }) : [];
  // Suggestions panel (Phase 3): rule suggestions + the saved AI drafts not yet added,
  // minus the ones dismissed for the same reason (0038; nothing is hidden before it's run).
  const [ai, savedDrafts, dismissals] = manager
    ? await Promise.all([getAiStatus(), getWorkOrderDrafts(), getSuggestionDismissals()])
    : [null, null, { ready: false, keys: new Set<string>() }];
  const aiLine = {
    ready: Boolean(ai && ai.configured && ai.tablesReady && ai.level !== "blocked"),
    budget: ai?.tablesReady ? `$${ai.spentUsd.toFixed(2)} of $${ai.budgetUsd.toFixed(2)} used this month` : "not set up",
  };
  const ruleSuggestions = withoutDismissed(suggestions, (s) => s.rule, dismissals.keys);
  const draftsLeft = (savedDrafts?.content.orders ?? []).filter((d) => !draftAdded(d, ops.actions));
  const draftOrders = withoutDismissed(draftsLeft, () => "ai", dismissals.keys);
  const hiddenSuggestions = suggestions.length - ruleSuggestions.length + draftsLeft.length - draftOrders.length;
  const suggestTotal = ruleSuggestions.length + draftOrders.length;

  // Promises to clients and blocked items in view (missed promises first): a small strip.
  const inView = new Set(scope.map((a) => a.id));
  const promiseItems = ops.priorities
    .filter((p) => p.action && inView.has(p.action.id) && p.action.status !== "done" && (p.action.status === "blocked" || p.action.promisedOn))
    .sort((x, y) => Number(promiseMissed(y.action!, ops.today)) - Number(promiseMissed(x.action!, ops.today)) || (x.action!.promisedOn ?? "9999").localeCompare(y.action!.promisedOn ?? "9999"));
  const missedCount = promiseItems.filter((p) => promiseMissed(p.action!, ops.today)).length;
  const blockedCount = promiseItems.filter((p) => p.action!.status === "blocked").length;
  // Rule-based client reminders (contact a client, your follow-up note): not saved items.
  const reminders = f.type || f.q || f.chip
    ? []
    : ops.priorities.filter((p) => !p.action && !p.id.startsWith("g_") && (f.who === undefined || (p.ownerId ?? null) === f.who) && (!f.client || p.clientSlug === f.client));

  const withParam = (href: string, param: string, anchor: string) => `${href}${href.includes("?") ? "&" : "?"}${param}=1#${anchor}`;
  const views = savedViews(member?.staffId);
  // The drawer (?open=<id>): any item the list knows about, including done and canceled ones.
  const openItem = f.open ? [...ops.actions, ...ops.canceled].find((a) => a.id === f.open) : undefined;
  const openHref = (id: string) => hubHref(f, { open: id });
  const shared = { today: ops.today, staff, canEdit: manager, canUseAi: manager && ops.orders, canCancel: isOwner && ops.cancel, openHref, openId: openItem?.id };

  // Board: work orders only (open, plus done in the last 7 days), same filters and chip.
  const weekAgo = new Date(Date.parse(`${ops.today}T00:00:00Z`) - 7 * 86_400_000).toISOString();
  const boardCards: BoardCard[] = (f.chip ? listed : scope)
    .filter((a) => a.kind === "work_order" && (a.status !== "done" || (a.doneAt ?? "") >= weekAgo))
    .map((a) => ({
      id: a.id,
      title: a.title,
      client: a.client?.name ?? (a.internal ? clientLabel(a) : null),
      owner: a.ownerName,
      ownerInitials: a.ownerName ? initials(a.ownerName) : null,
      status: a.status === "canceled" ? "done" : a.status,
      due: a.status === "done" ? { text: `Done ${a.doneAt ? a.doneAt.slice(5, 10).replace("-", "/") : ""}`.trim(), tone: "none" as const } : dueHint(a.dueOn, ops.today),
      urgent: a.priority === "critical",
      blockedReason: a.blockedReason ?? null,
      href: openHref(a.id),
    }));
  // Team view (Phase 4): the founder isn't counted as available unless switched on (?founder=1).
  const includeFounder = sp.founder === "1";
  const load = teamLoad({ actions: ops.actions, team: team.members, today: ops.today, includeFounder });
  const withFounder = (on: boolean) => `${hubHref(f)}${on ? `${hubHref(f).includes("?") ? "&" : "?"}founder=1` : ""}`;
  const copyText = workOrdersAsText(workOrderGroups({ actions: listed, staff, today: ops.today, show: "all" }), ops.today);

  return (
    <>
      {openItem && (
        <WorkDrawer
          item={openItem}
          closeHref={hubHref(f, { open: undefined })}
          viewer={{ developer: false, manager, owner: isOwner, preview: false }}
          staff={staff}
          today={ops.today}
          leadName={leadName(openItem)}
          doneWhenReady={ops.doneWhen}
        />
      )}
      {manager && ops.ready && (
        <>
          <SmartAddPopup clients={formClients} staff={staff} today={ops.today} myStaffId={member?.staffId ?? null} ai={aiLine} cancelReady={ops.cancel} ordersReady={ops.orders} defaultOpen={sp.new === "1"} />
          {ops.orders && (
            <SuggestionsPopup
              rules={ruleSuggestions}
              drafts={savedDrafts ? { createdAt: savedDrafts.createdAt, headline: savedDrafts.content.headline, orders: draftOrders } : null}
              clients={formClients}
              staff={staff}
              today={ops.today}
              ai={aiLine}
              dismissReady={dismissals.ready}
              hiddenCount={hiddenSuggestions}
              isOwner={isOwner}
              defaultOpen={sp.suggest === "1"}
            />
          )}
        </>
      )}
      {ops.ready && <HubShortcuts canAdd={manager && ops.ready} />}
      {manager && ops.ready && <UndoToast />}
      {ops.ready && <ShortcutsPopup canAdd={manager} defaultOpen={sp.keys === "1"} />}
      {/* Computers: leave room for the drawer so the list stays visible beside it. */}
      <div className={cn(openItem && "lg:mr-[34rem]")}>
      <WorkHeader f={f} newHref={withParam(hubHref(f), "new", "smart-add")} suggestions={suggestTotal} suggestHref={withParam(hubHref(f), "suggest", "suggestions")} keysHref={withParam(hubHref(f), "keys", "shortcuts")} canAdd={manager && ops.ready} canSuggest={manager && ops.ready && ops.orders} />

      {manager && !ops.orders && (
        <p className="mt-4 rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm">
          <span className="font-semibold text-amber">One setup step needed.</span> <span className="text-muted">Run 0010 in Supabase to add work orders with steps, links and AI drafts. Issues already show below.</span>
        </p>
      )}
      {manager && ops.orders && !ops.review && (
        <p className="mt-4 rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm">
          <span className="font-semibold text-amber">One setup step needed for reviews.</span> <span className="text-muted">Run 0011 in Supabase so developers send work for review instead of marking it done.</span>
        </p>
      )}
      {manager && ops.orders && ops.review && !ops.cancel && (
        <p className="mt-4 rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm">
          <span className="font-semibold text-amber">One setup step for Cancel and Smart add.</span> <span className="text-muted">Run 0013 in Supabase. Everything else works already.</span>
        </p>
      )}

      {samples && (
        <p className="mt-4 rounded-2xl border border-sky/30 bg-sky/8 p-3 text-sm text-muted">
          <span className="font-semibold text-ink">This is the demo.</span> The work below is made up, on fictional clients. Development work itself still happens in GoHighLevel.
        </p>
      )}

      {!ops.ready ? (
        <p className="glass mt-4 rounded-2xl px-4 py-3 text-sm text-muted">Work items turn on after the database setup steps. Nothing to show yet.</p>
      ) : (
        <>
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatChips f={f} counts={counts} />
              {f.view === "list" && (
                <p className="ml-auto flex items-center gap-2 text-sm text-muted">
                  {openCount} open{filtered ? " match" : ""}
                  {openCount > 0 && <CopyButton text={copyText} label="Copy this list as text for GoHighLevel" />}
                </p>
              )}
            </div>
            <FilterBar
              hidden={{ view: f.view === "list" ? undefined : f.view, q: f.q || undefined, chip: f.chip, open: f.open }}
              who={f.who === null ? "none" : (f.who ?? "")}
              client={f.client ?? ""}
              type={f.type ?? ""}
              prio={f.prio ?? ""}
              staff={staff}
              clients={filterClients}
              types={HUB_TYPES}
            >
              <div className="flex min-h-10 flex-wrap items-center gap-2 sm:ml-auto">
                <span className="text-xs text-muted">Views:</span>
                {views.map((v) => {
                  const href = hubHref({ ...f, q: "", client: undefined, type: undefined, prio: undefined }, v.set);
                  const on = hubHref(f) === href;
                  return (
                    <Link key={v.id} href={href} aria-current={on ? "true" : undefined} className={cn("pressable inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold", on ? "bg-violet/25 text-ink" : "text-muted hover:bg-white/[0.06] hover:text-ink")}>
                      {v.label}
                    </Link>
                  );
                })}
                {filtered && (
                  <Link href={hubHref({ view: f.view, q: "" })} className="pressable inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
                    Clear all
                  </Link>
                )}
              </div>
            </FilterBar>
          </div>

          {f.view === "list" && (promiseItems.length > 0 || reminders.length > 0) && (
          <div className="mt-4 grid items-start gap-2 lg:grid-cols-2">
          {promiseItems.length > 0 && (
            <details className="glass group rounded-2xl">
              <summary className="pressable flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm [&::-webkit-details-marker]:hidden">
                <span className="font-semibold">Promises &amp; blockers</span>
                <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-xs font-semibold text-muted">{promiseItems.length}</span>
                <span className="hidden truncate text-muted sm:inline">
                  {promiseItems.filter((p) => p.action!.promisedOn).length} promised to clients · {blockedCount} blocked
                </span>
                {missedCount > 0 && <span className="ml-auto shrink-0 font-semibold text-rose">{missedCount} missed</span>}
              </summary>
              <div className="px-2 pb-2">
                <PriorityList items={promiseItems} staff={staff} canEdit={manager} limit={6} empty="Nothing promised or blocked right now." />
              </div>
            </details>
          )}
          {reminders.length > 0 && (
            <details className="glass group rounded-2xl">
              <summary className="pressable flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm [&::-webkit-details-marker]:hidden">
                <span className="font-semibold">Client reminders</span>
                <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-xs font-semibold text-muted">{reminders.length}</span>
                <span className="hidden truncate text-muted sm:inline" title="From the rules, not saved items">Clients to contact, your follow-up notes</span>
              </summary>
              <div className="px-2 pb-2">
                <PriorityList items={reminders} staff={staff} canEdit={manager} limit={6} empty="No reminders." />
              </div>
            </details>
          )}
          </div>
          )}

          {f.view === "list" && (
            <>
              <div className="mt-4" />
              <WorkList
                groups={groups}
                done={done}
                shared={shared}
                leadName={leadName}
                empty={
                  filtered ? (
                    <>
                      Nothing matches these filters.{" "}
                      <Link href={hubHref({ view: "list", q: "" })} className="font-semibold text-ink underline underline-offset-2">
                        Clear all
                      </Link>
                    </>
                  ) : (
                    "Nothing open right now."
                  )
                }
              />
              <div className="mt-2">
                <ShortcutHint canAdd={manager} />
              </div>
              <p className="mt-2 px-1 text-xs text-muted">Saved in this app only; GoHighLevel isn&apos;t changed. Copy gives plain text (titles, steps, due dates, links; no money) to paste into GoHighLevel yourself.</p>
            </>
          )}

          {f.view === "board" && (
            <div className="mt-4">
              {boardCards.length === 0 && (
                <p className="glass mb-2 rounded-2xl px-4 py-3 text-sm text-muted">
                  {filtered ? (
                    <>
                      No work orders match these filters.{" "}
                      <Link href={hubHref({ view: "board", q: "" })} className="font-semibold text-ink underline underline-offset-2">
                        Clear all
                      </Link>
                    </>
                  ) : (
                    "No work orders yet. Add one with + New."
                  )}
                </p>
              )}
              <WorkOrderBoard cards={boardCards} openId={openItem?.id} />
              <p className="mt-2 px-1 text-xs text-muted">Work orders only (the filters and chips apply). Drag a card on a computer, or use “Move to” on a phone. Done shows the last 7 days.</p>
              <div className="mt-2">
                <ShortcutHint canAdd={manager} done={false} />
              </div>
            </div>
          )}

          {f.view === "team" && (
            <div className="mt-4">
              <TeamView
                rows={load.rows}
                totals={load.totals}
                personHref={(id) => hubHref(f, { view: "list", who: id })}
                unassignedHref={hubHref(f, { view: "list", who: null })}
                founderToggleHref={withFounder(!includeFounder)}
                includeFounder={includeFounder}
                hasFounder={team.members.some((m) => m.role === "founder")}
              />
            </div>
          )}
        </>
      )}

      {samples && <SampleOrders today={today} />}

      {ops.ready && (
        <WorkMore ops={ops} team={team} isOwner={isOwner} canPreview={usesDatabase() && canPreview(member?.role)} />
      )}
      </div>
    </>
  );
}

/** The demo only: the made-up work orders and developer load (no database). */
function SampleOrders({ today }: { today: string }) {
  const orders = getWorkOrders();
  const rules = getWorkRules();
  const devs = getSampleDevelopers();
  const devName = Object.fromEntries(devs.map((d) => [d.id, d.name]));
  const open = orders.filter((o) => o.status !== "done");
  const done = orders.filter((o) => o.status === "done");
  return (
    <>
      <SectionTitle aside={<Provenance kind="sample" />}>Sample work orders</SectionTitle>
      <ul className={CARD_GRID}>
        {[...open, ...done].map((o) => (
          <li key={o.id}>
            <WorkOrderCard order={o} today={today} assigneeName={devName[o.assignee] ?? "Unassigned"} />
          </li>
        ))}
      </ul>

      <SectionTitle aside={<Provenance kind="sample" />}>Developer load</SectionTitle>
      <div className={CARD_GRID}>
        {devs.map((d) => {
          const seo = d.load?.seoClients ?? 0;
          const successful = d.load?.successfulThisMonth ?? 0;
          const bonus = successful >= rules.bonusAfterSuccessfulClients;
          return (
            <GlassCard key={d.id} padding="tight" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{d.name}</p>
                {bonus ? (
                  <Pill color="lime">
                    <Award aria-hidden className="size-3" /> Bonus: ${successful * rules.bonusPerClientUsd}
                  </Pill>
                ) : (
                  <Pill>{rules.bonusAfterSuccessfulClients - successful} more for bonus</Pill>
                )}
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>
                    SEO clients {seo} / {rules.maxSeoClientsPerDeveloper}
                  </span>
                  <span>
                    {d.load?.hoursLogged ?? 0} hrs logged · SEO budget {seo * rules.seoHoursPerClient} hrs
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={cn("h-full rounded-full", seo >= rules.maxSeoClientsPerDeveloper ? "bg-amber" : "bg-teal")} style={{ width: `${(seo / rules.maxSeoClientsPerDeveloper) * 100}%` }} />
                </div>
              </div>
              <p className="text-xs text-muted">
                {d.openOrders} open work orders
                {d.overdue > 0 && <span className="font-semibold text-rose"> · {d.overdue} overdue</span>}
                {d.untouchedToday > 0 && <span className="text-amber"> · {d.untouchedToday} not touched today</span>}
              </p>
            </GlassCard>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-xs text-muted">Pay and bonus details are visible to the owner only.</p>
    </>
  );
}
