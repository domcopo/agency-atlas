import { ArrowLeft, Lightbulb, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/cards/CopyButton";
import { CanceledList, StatsLine, WorkOrderList } from "@/components/cards/WorkOrderList";
import { WorkloadChips } from "@/components/cards/WorkloadChips";
import { WorkOrderBoard, type BoardCard } from "@/components/cards/WorkOrderBoard";
import { WorkOrderDraftsButton } from "@/components/forms/AiButtons";
import { QuickAddWorkOrders } from "@/components/forms/QuickAddWorkOrders";
import { WorkOrderForm } from "@/components/forms/WorkOrderForm";
import { Fold } from "@/components/shell/Fold";
import { PageHeader } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getAiStatus, getMember, getOps, getTeam, getWorkOrderDrafts, usesDatabase } from "@/lib/data-source";
import { asDueFilter, deadlineColor, deadlineText, DUE_FILTERS, matchesDue } from "@/lib/work-orders";
import { draftAdded, minutesLabel, reviewQueue, suggestWorkOrders, workloadRows, workOrderGroups, workOrdersAsText, type WorkOrderShow, type WorkOrderStatusFilter } from "@/lib/ops";

export const metadata: Metadata = { title: "Work orders" };

const field = "min-h-10 w-full rounded-xl border border-line bg-white/5 px-2 text-sm text-ink";

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<{ who?: string; client?: string; show?: string; status?: string; due?: string; view?: string }> }) {
  if (!usesDatabase()) return <RoleNotice title="Work orders" />;
  const member = await getMember();
  // Developers have their own list on the Work tab (the database limits what they can read anyway).
  if (!member || (member.role !== "owner" && member.role !== "manager")) return <RoleNotice title="Work orders" />;

  const ops = await getOps();
  const team = (await getTeam()).members;
  const staff = team.map((m) => ({ id: m.id, name: m.name }));
  const isOwner = member.role === "owner";
  const sp = await searchParams;
  const who = sp.who === "none" ? null : sp.who && staff.some((m) => m.id === sp.who) ? sp.who : undefined;
  const client = sp.client && ops.clients.some((c) => c.id === sp.client) ? sp.client : undefined;
  const show: WorkOrderShow = sp.show === "all" ? "all" : "work";
  const status: WorkOrderStatusFilter = sp.status === "blocked" || sp.status === "overdue" || sp.status === "review" || sp.status === "done" ? sp.status : "open";

  const due = asDueFilter(sp.due);
  const view = sp.view === "board" ? "board" : "list";
  // Archived work (finished or canceled, owner only) leaves every list; it's kept below.
  const live = ops.actions.filter((a) => !a.archivedAt);
  const archived = ops.actions.filter((a) => a.archivedAt && a.kind === "work_order");
  const groups = workOrderGroups({ actions: live.filter((a) => matchesDue(a, due, ops.today)), staff, today: ops.today, show, who, client, status });
  const boardCards: BoardCard[] = live
    .filter((a) => a.kind === "work_order" && (who === undefined || (a.ownerId ?? null) === who) && (!client || a.client?.slug === client) && matchesDue(a, due, ops.today))
    .filter((a) => a.status !== "done" || (a.doneAt ?? "") >= new Date(Date.parse(`${ops.today}T00:00:00Z`) - 7 * 86_400_000).toISOString())
    .map((a) => ({
      id: a.id,
      title: a.title,
      client: a.client?.name ?? null,
      owner: a.ownerName,
      status: a.status === "canceled" ? "done" : a.status,
      color: deadlineColor(a.dueOn, ops.today, a.status),
      deadline: a.status === "done" ? "Done" : deadlineText(a.dueOn, ops.today),
      urgent: a.priority === "critical",
    }));
  const query = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const all = { who: sp.who, client: sp.client, show: sp.show, status: sp.status, due: sp.due, view: sp.view, ...over };
    for (const [k, v] of Object.entries(all)) if (v) q.set(k, v);
    const str = q.toString();
    return `/work/orders${str ? `?${str}` : ""}`;
  };
  const everyone = workOrderGroups({ actions: ops.actions, staff, today: ops.today, show });
  const total = everyone.reduce(
    (t, g) => ({ open: t.open + g.stats.open, overdue: t.overdue + g.stats.overdue, blocked: t.blocked + g.stats.blocked, est: t.est + g.stats.estMinutesOpen, done7: t.done7 + g.stats.done7 }),
    { open: 0, overdue: 0, blocked: 0, est: 0, done7: 0 },
  );
  const listed = groups.reduce((n, g) => n + g.items.length, 0);
  // Sent for review, everyone's, oldest first.
  const review = reviewQueue(ops.actions, ops.today);
  const reviewGroups = workOrderGroups({ actions: ops.actions, staff, today: ops.today, show: "all", status: "review" }).filter((g) => g.items.length);
  const copyText = workOrdersAsText(groups, ops.today);

  const clients = ops.clients
    .filter((c) => c.dbId && c.status !== "canceled")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ slug: c.id, name: c.name }));
  const ai = await getAiStatus();
  const aiReady = ai.configured && ai.tablesReady && ai.level !== "blocked";
  const drafts = await getWorkOrderDrafts();
  // Everyone's pile of open work, and free rule-based suggestions (no AI, nothing added on its own).
  const workload = workloadRows({ actions: ops.actions, staff, today: ops.today });
  const suggestions = ops.orders ? suggestWorkOrders({ clients: ops.clients, risks: ops.risks, actions: [...ops.actions, ...ops.canceled], team, workload, today: ops.today }) : [];
  const ruleLabel = { risk: "Client at risk", onboarding: "New client", routine: "Routine check" } as const;

  return (
    <>
      <PageHeader
        title="Work orders"
        subtitle="All delivery work, who has it, and what's next"
        action={
          <Link href="/work" className="pressable glass flex min-h-11 items-center gap-1 rounded-2xl px-3 text-xs font-semibold">
            <ArrowLeft aria-hidden className="size-3.5" /> Work
          </Link>
        }
      />

      {!ops.orders && (
        <p className="mb-3 rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm">
          <span className="font-semibold text-amber">One setup step needed.</span> <span className="text-muted">Run 0010 in Supabase to add work orders with steps, links and AI drafts. Issues already show below.</span>
        </p>
      )}

      {ops.orders && !ops.review && (
        <p className="mb-3 rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm">
          <span className="font-semibold text-amber">One setup step needed for reviews.</span> <span className="text-muted">Run 0011 in Supabase so developers send work for review instead of marking it done.</span>
        </p>
      )}

      {ops.orders && ops.review && !ops.cancel && (
        <p className="mb-3 rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm">
          <span className="font-semibold text-amber">One setup step for Cancel and Quick add.</span> <span className="text-muted">Run 0013 in Supabase. Everything else works already.</span>
        </p>
      )}

      <section aria-label="Work order totals" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "Open", value: String(total.open), tone: "" },
          { label: "Overdue", value: String(total.overdue), tone: total.overdue ? "text-rose" : "" },
          { label: "Blocked", value: String(total.blocked), tone: total.blocked ? "text-rose" : "" },
          { label: "Waiting for review", value: String(review.waiting.length), tone: review.waiting.length ? "text-violet" : "" },
          { label: "Done this week", value: String(total.done7), tone: "text-lime" },
        ].map((t) => (
          <div key={t.label} className="glass rounded-2xl px-3 py-2">
            <p className="text-[11px] text-muted">{t.label}</p>
            <p className={`font-display text-lg font-bold ${t.tone}`}>{t.value}</p>
          </div>
        ))}
      </section>
      <p className="mt-1.5 px-1 text-[11px] text-faint">
        {show === "work" ? "Work orders and issues" : "All items, including follow-ups"}
        {total.est ? ` · about ${minutesLabel(total.est)} of open work estimated` : ""}. Saved in this app only; GoHighLevel isn&apos;t changed.
      </p>

      <section aria-label="Workload" className="mt-5">
        <h2 className="mb-2 px-1 font-display text-base font-bold">Workload</h2>
        <WorkloadChips rows={workload} />
      </section>

      {ops.orders && (
        <Fold
          label="Suggested work orders"
          title="Suggested for you"
          defaultOpen={suggestions.length > 0}
          summary={suggestions.length ? `${suggestions.length} suggestions from your records · free, no AI` : "Nothing to suggest right now"}
          badge={suggestions.length ? <span className="inline-flex items-center gap-1 font-semibold text-amber"><Lightbulb aria-hidden className="size-4" />{suggestions.length}</span> : undefined}
        >
          <div className="space-y-2.5">
            {suggestions.map((d) => (
              <article key={`${d.clientSlug}-${d.title}`} className="glass rounded-3xl p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber">{ruleLabel[d.rule]}</p>
                <p className="text-sm font-semibold">{d.title}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {d.clientName} · {d.priority} · {d.estMinutes ? `~${minutesLabel(d.estMinutes)}` : "no estimate"} ·{" "}
                  {d.assigneeName ? <span className="text-violet">suggested: {d.assigneeName}{d.assigneeWhy ? ` (${d.assigneeWhy})` : ""}</span> : "no one suggested"}
                </p>
                <p className="mt-1 text-xs text-muted">Why: {d.why}</p>
                <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs text-muted">
                  {d.steps.map((st, j) => (
                    <li key={`${j}-${st}`}>{st}</li>
                  ))}
                </ol>
                <details className="mt-2">
                  <summary className="pressable inline-flex min-h-10 cursor-pointer list-none items-center rounded-xl border border-violet/40 bg-violet/10 px-3 text-xs font-semibold">Review and add</summary>
                  <div className="mt-2">
                    <WorkOrderForm
                      clients={clients}
                      staff={staff}
                      today={ops.today}
                      fromDraft
                      submitLabel="Add this work order"
                      defaults={{ slug: d.clientSlug ?? undefined, title: d.title, steps: d.steps.join("\n"), priority: d.priority, ownerId: d.assigneeId ?? undefined, est: d.estMinutes, notes: d.why.slice(0, 500) }}
                    />
                  </div>
                </details>
              </article>
            ))}
            <p className="px-1 text-[11px] text-faint">
              Made by simple rules: at-risk clients with no open work, new clients with no work orders yet, and clients with no work in 30 days. Developer work goes to whoever has the least open
              hours. Add the ones you want; the rest go away once the reason does.{isOwner ? " Canceling an added one keeps it from coming straight back." : ""}
            </p>
          </div>
        </Fold>
      )}

      {ops.orders && (
        <Fold
          label="Quick add"
          title="Quick add: type, talk or photo"
          summary="Describe it or snap a screenshot; AI outlines the work orders for you to check"
          badge={<Sparkles aria-hidden className="size-4 text-violet" />}
        >
          <QuickAddWorkOrders
            clients={clients}
            staff={staff}
            today={ops.today}
            disabled={!aiReady || !ops.cancel}
            disabledNote={!ops.cancel ? "Turns on after one setup step (0013 SQL)." : !aiReady ? "The AI isn't available right now (not set up, or this month's budget is used up)." : undefined}
          />
          <p className="mt-1.5 px-1 text-[11px] text-faint">A few cents per outline (a bit more with a photo); budget {ai.tablesReady ? `$${ai.spentUsd.toFixed(2)} of $${ai.budgetUsd.toFixed(2)} used this month` : "not set up"}.</p>
        </Fold>
      )}

      {ops.review && (
        <Fold
          label="Waiting for your review"
          title="Waiting for your review"
          defaultOpen={review.waiting.length > 0}
          summary={
            review.waiting.length
              ? `${review.waiting.length} sent for review · oldest first`
              : `Nothing waiting${review.avgWaitMinutes !== null ? ` · reviews took ${minutesLabel(review.avgWaitMinutes)} on average this week` : ""}`
          }
          badge={review.waiting.length ? <span className="font-semibold text-violet">{review.waiting.length}</span> : undefined}
        >
          <WorkOrderList groups={reviewGroups} today={ops.today} mode="manage" staff={staff} canUseAi={false} empty="Nothing waiting for review." />
          <p className="mt-1.5 px-1 text-[11px] text-faint">
            Developers send work orders and issues here instead of marking them done. Approve to close it, or send it back with what still needs fixing.
            {review.avgWaitMinutes !== null ? ` Reviews this week took ${minutesLabel(review.avgWaitMinutes)} on average.` : ""}
          </p>
        </Fold>
      )}

      <Fold label="Breakdown by person" title="By person" summary={`${everyone.filter((g) => g.ownerId).length} people with work · ${everyone.find((g) => !g.ownerId)?.stats.open ?? 0} unassigned`}>
        <ul className="glass divide-y divide-line rounded-3xl">
          {everyone.map((g) => (
            <li key={g.ownerId ?? "none"}>
              <Link href={`/work/orders?who=${g.ownerId ?? "none"}${show === "all" ? "&show=all" : ""}`} className="pressable block px-4 py-2.5 hover:bg-white/[0.04]">
                <span className={`block text-sm font-semibold ${g.ownerId ? "" : "text-amber"}`}>{g.ownerName}</span>
                <StatsLine s={g.stats} />
              </Link>
            </li>
          ))}
        </ul>
      </Fold>

      <Fold label="Add a work order" title="New work order" summary="Client, steps, who, when, and the GoHighLevel link it came from">
        <div className="glass rounded-3xl p-4">
          <WorkOrderForm clients={clients} staff={staff} today={ops.today} />
        </div>
      </Fold>

      <Fold
        label="AI work order drafts"
        title="AI drafts"
        summary={drafts ? `${drafts.content.orders.length} suggestions from ${drafts.createdAt.slice(0, 10)} · review and add` : "Let the AI suggest work orders and who should do them"}
        badge={<Sparkles aria-hidden className="size-4 text-violet" />}
      >
        <div className="space-y-2.5">
          <div className="glass rounded-3xl p-4">
            <WorkOrderDraftsButton label={drafts ? "Draft again" : "Draft work orders with AI"} disabled={!aiReady || !ops.orders} />
            <p className="mt-2 text-[11px] text-faint">
              Reads coded facts (no client or team names leave the app): risks, overdue items, contact times, workload. Suggests work and a person. Nothing is added until you tap
              Add. A few cents per draft; budget {ai.tablesReady ? `$${ai.spentUsd.toFixed(2)} of $${ai.budgetUsd.toFixed(2)} used this month` : "not set up"}.
            </p>
          </div>
          {drafts?.content.headline && <p className="px-1 text-sm">{drafts.content.headline}</p>}
          {drafts?.content.orders.map((d, i) => {
            const added = draftAdded(d, ops.actions);
            return (
              <article key={`${i}-${d.title}`} className="glass rounded-3xl p-3.5">
                <p className="text-sm font-semibold">{d.title}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {d.clientName ?? "No client"} · {d.priority} · {d.estMinutes ? `~${minutesLabel(d.estMinutes)}` : "no estimate"} ·{" "}
                  {d.assigneeName ? (
                    <span className="text-violet">
                      suggested: {d.assigneeName}
                      {d.assigneeWhy ? ` (${d.assigneeWhy})` : ""}
                    </span>
                  ) : (
                    "no one suggested"
                  )}
                </p>
                <p className="mt-1 text-xs text-muted">Why: {d.why}</p>
                {d.steps.length > 0 && (
                  <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs text-muted">
                    {d.steps.map((s, j) => (
                      <li key={`${j}-${s}`}>{s}</li>
                    ))}
                  </ol>
                )}
                {added ? (
                  <p className="mt-2 text-xs font-semibold text-lime">Added ✓</p>
                ) : d.clientSlug ? (
                  <details className="mt-2">
                    <summary className="pressable inline-flex min-h-10 cursor-pointer list-none items-center rounded-xl border border-violet/40 bg-violet/10 px-3 text-xs font-semibold">
                      Review and add
                    </summary>
                    <div className="mt-2">
                      <WorkOrderForm
                        clients={clients}
                        staff={staff}
                        today={ops.today}
                        fromDraft
                        submitLabel="Add this work order"
                        defaults={{ slug: d.clientSlug, title: d.title, steps: d.steps.join("\n"), priority: d.priority, ownerId: d.assigneeId ?? undefined, est: d.estMinutes, notes: d.why.slice(0, 500) }}
                      />
                    </div>
                  </details>
                ) : (
                  <p className="mt-2 text-[11px] text-faint">Not tied to one client: add it by hand if you want it.</p>
                )}
              </article>
            );
          })}
          {drafts && <p className="px-1 text-[11px] text-faint">AI suggestions from your records. Check each one before adding; the AI can be wrong.</p>}
        </div>
      </Fold>

      <div id="list" className="mt-5 flex flex-wrap items-center gap-1.5">
        {[
          { label: "List", href: query({ view: undefined }), on: view === "list" },
          { label: "Board", href: query({ view: "board" }), on: view === "board" },
        ].map((t) => (
          <Link key={t.label} href={t.href} aria-current={t.on ? "page" : undefined} className={`pressable inline-flex min-h-10 items-center rounded-full border px-3.5 text-xs font-semibold ${t.on ? "border-violet/60 bg-violet/20" : "border-line bg-white/5 text-muted"}`}>
            {t.label}
          </Link>
        ))}
        <Link href={query({ due: due === "soon" ? undefined : "soon" })} className={`pressable inline-flex min-h-10 items-center rounded-full border px-3.5 text-xs font-semibold ${due === "soon" ? "border-rose/60 bg-rose/15 text-rose" : "border-line bg-white/5 text-muted"}`}>
          Overdue + this week
        </Link>
      </div>

      <form method="get" className="glass mt-2 grid grid-cols-2 gap-2 rounded-3xl p-3 sm:grid-cols-6">
        <label className="text-[11px] text-muted">
          Person
          <select name="who" defaultValue={who === null ? "none" : (who ?? "")} className={field}>
            <option value="">Everyone</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="none">No one assigned</option>
          </select>
        </label>
        <label className="text-[11px] text-muted">
          Client
          <select name="client" defaultValue={client ?? ""} className={field}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted">
          Showing
          <select name="status" defaultValue={status} className={field}>
            <option value="open">Not done</option>
            <option value="overdue">Overdue</option>
            <option value="blocked">Blocked</option>
            <option value="review">Waiting for review</option>
            <option value="done">Done (2 weeks)</option>
          </select>
        </label>
        <label className="text-[11px] text-muted">
          Due
          <select name="due" defaultValue={due} className={field}>
            {DUE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        {view === "board" && <input type="hidden" name="view" value="board" />}
        <label className="text-[11px] text-muted">
          Include
          <select name="show" defaultValue={show} className={field}>
            <option value="work">Work orders + issues</option>
            <option value="all">Also follow-ups</option>
          </select>
        </label>
        <button type="submit" className="pressable col-span-2 min-h-10 self-end rounded-xl bg-white/10 text-sm font-semibold sm:col-span-1">
          Apply
        </button>
      </form>

      <div className="mb-2.5 mt-3 flex items-center justify-between gap-2 px-1">
        <p className="text-sm text-muted">
          {listed} {listed === 1 ? "item" : "items"}
        </p>
        {listed > 0 && <CopyButton text={copyText} label="Copy this list as text for GoHighLevel" />}
      </div>
      {view === "board" ? (
        <>
          <WorkOrderBoard cards={boardCards} />
          <p className="mt-1.5 px-1 text-[11px] text-faint">Work orders only (Person, Client and Due filters apply). Drag a card on a computer, or use “Move to” on a phone. Done shows the last 7 days.</p>
        </>
      ) : (
        <WorkOrderList groups={groups} today={ops.today} mode="manage" staff={staff} canUseAi={aiReady && ops.orders} canCancel={isOwner && ops.cancel} empty="No work orders match. Add one above, or change the filter." />
      )}
      {listed > 0 && <p className="mt-2 px-1 text-[11px] text-faint">Copy gives plain text (titles, steps, due dates, links; no money) to paste into a GoHighLevel task yourself, or take a screenshot.</p>}

      {isOwner && archived.length > 0 && (
        <div className="mt-5">
          <Fold label="Archived work orders" title="Archived" summary={`${archived.length} archived · kept for history`}>
            <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
              {archived.slice(0, 100).map((a) => (
                <li key={a.id}>
                  <Link href={`/work/orders/${a.id}`} className="pressable block px-4 py-2.5 text-sm">
                    <span className="font-semibold">{a.title}</span> <span className="text-[11px] text-muted">· {a.client?.name ?? "No client"} · archived {a.archivedAt?.slice(0, 10)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Fold>
        </div>
      )}

      {isOwner && ops.cancel && (
        <div className="mt-5">
          <Fold label="Canceled work" title="Canceled" summary={ops.canceled.length ? `${ops.canceled.length} canceled · kept for history, restore any time` : "Nothing canceled"}>
            <CanceledList items={ops.canceled.slice(0, 50)} />
            <p className="mt-1.5 px-1 text-[11px] text-faint">Only you can cancel or restore. Canceled work leaves every list, count and workload, but nothing is deleted.</p>
          </Fold>
        </div>
      )}
    </>
  );
}
