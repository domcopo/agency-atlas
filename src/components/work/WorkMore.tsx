// Work hub "More" area (docs/WORK_HUB_PLAN.md): what the old Work orders and Work pages had
// that doesn't have its own place yet, unchanged and folded away. Smart add, the by-hand
// form, suggestions and AI drafts moved to pop-ups in Phase 3 (WorkPopups.tsx).

import { Crown, Headset, MessageSquareText, Wrench } from "lucide-react";
import Link from "next/link";
import { startPreview } from "@/app/actions";
import { GlassCard } from "@/components/cards/GlassCard";
import { CanceledList, WorkOrderList } from "@/components/cards/WorkOrderList";
import { priorityStyle } from "@/components/cards/WorkOrderCard";
import { Pill, Provenance } from "@/components/labels/labels";
import { CARD_GRID, Column, Columns } from "@/components/shell/Columns";
import { Fold } from "@/components/shell/Fold";
import { SectionTitle } from "@/components/shell/PageHeader";
import { clientLabel } from "@/lib/agency";
import { getOps, getTeam, getWorkRules } from "@/lib/data-source";
import { minutesLabel, reviewQueue, workOrderGroups } from "@/lib/ops";
import type { TeamRole, WorkPriority } from "@/lib/types";

type Ops = Awaited<ReturnType<typeof getOps>>;
type Team = Awaited<ReturnType<typeof getTeam>>;

const roleInfo: Record<TeamRole, { label: string; icon: typeof Crown; color: string }> = {
  founder: { label: "Founder · final decisions", icon: Crown, color: "text-violet bg-violet/12" },
  client_comms: { label: "Client communication & work orders", icon: MessageSquareText, color: "text-amber bg-amber/12" },
  client_manager: { label: "Client manager & calls", icon: Headset, color: "text-violet bg-violet/12" },
  seo_developer: { label: "SEO developer", icon: Wrench, color: "text-teal bg-teal/12" },
};

export function WorkMore({
  ops,
  team,
  isOwner,
  canPreview,
}: {
  ops: Ops;
  team: Team;
  isOwner: boolean;
  canPreview: boolean;
}) {
  const staff = team.members.map((m) => ({ id: m.id, name: m.name }));
  const review = reviewQueue(ops.actions, ops.today);
  const reviewGroups = workOrderGroups({ actions: ops.actions, staff, today: ops.today, show: "all", status: "review" }).filter((g) => g.items.length);
  const archived = ops.actions.filter((a) => a.archivedAt && a.kind === "work_order");
  const rules = getWorkRules();
  const realTeam = team.source !== "demo";
  const nameForRole = (role: TeamRole) => team.members.filter((m) => m.role === role).map((m) => m.name).join(" or ");

  return (
    <section aria-labelledby="work-more" className="mt-8 lg:mt-10">
      <h2 id="work-more" className="px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">More</h2>

      <Columns>
        <Column>
          {ops.review && (
            <Fold
              label="Waiting for your review"
              title="Waiting for your review"
              summary={
                review.waiting.length
                  ? `${review.waiting.length} sent for review · oldest first`
                  : `Nothing waiting${review.avgWaitMinutes !== null ? ` · reviews took ${minutesLabel(review.avgWaitMinutes)} on average this week` : ""}`
              }
              badge={review.waiting.length ? <span className="font-semibold text-violet">{review.waiting.length}</span> : undefined}
            >
              <WorkOrderList groups={reviewGroups} today={ops.today} mode="manage" staff={staff} canUseAi={false} empty="Nothing waiting for review." />
              <p className="mt-2 px-1 text-xs text-muted">
                Developers send work orders and issues here instead of marking them done. Approve to close it, or send it back with what still needs fixing.
                {review.avgWaitMinutes !== null ? ` Reviews this week took ${minutesLabel(review.avgWaitMinutes)} on average.` : ""}
              </p>
            </Fold>
          )}

          {canPreview && team.members.length > 0 && (
            <Fold label="Preview as a developer" title="Preview as a developer" summary="See Home, Work and Kit exactly as one person's login shows them (look only)">
              <form action={startPreview} className="glass flex gap-2 rounded-3xl p-3">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Team member</span>
                  <select name="staffId" required defaultValue="" className="min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink">
                    <option value="" disabled>
                      Pick a person…
                    </option>
                    {[...team.members]
                      .sort((a, b) => Number(b.role === "seo_developer") - Number(a.role === "seo_developer") || a.name.localeCompare(b.name))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button type="submit" className="pressable min-h-11 rounded-xl border border-line bg-white/5 px-4 text-sm font-semibold">
                  Preview
                </button>
              </form>
              <p className="mt-2 px-1 text-xs text-muted">Look only: nothing can be changed until you exit. Ends after an hour.</p>
            </Fold>
          )}

          {isOwner && archived.length > 0 && (
            <Fold label="Archived work orders" title="Archived" summary={`${archived.length} archived · kept for history`}>
              <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
                {archived.slice(0, 100).map((a) => (
                  <li key={a.id}>
                    <Link href={`/work/orders/${a.id}`} className="pressable block px-4 py-3 text-sm">
                      <span className="font-semibold">{a.title}</span> <span className="text-xs text-muted">· {clientLabel(a)} · archived {a.archivedAt?.slice(0, 10)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Fold>
          )}

          {isOwner && ops.cancel && (
            <Fold label="Canceled work" title="Canceled" summary={ops.canceled.length ? `${ops.canceled.length} canceled · kept for history, restore any time` : "Nothing canceled"}>
              <CanceledList items={ops.canceled.slice(0, 50)} />
              <p className="mt-2 px-1 text-xs text-muted">Only you can cancel or restore. Canceled work leaves every list, count and workload, but nothing is deleted.</p>
            </Fold>
          )}

        </Column>

        <Column>
          <Fold label="Team and rules" title="Team & rules" summary="Who does what, who to go to, daily order, priority levels">
            <SectionTitle aside={<Provenance kind={realTeam ? "real" : "demo"} what="your team" />}>Your team</SectionTitle>
            <div className="space-y-2">
              {team.members.map((m) => {
                const r = roleInfo[m.role];
                const Icon = r.icon;
                return (
                  <GlassCard key={m.id} padding="tight" className="flex gap-3">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${r.color}`}>
                      <Icon aria-hidden className="size-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{m.name}</p>
                      <p className="text-xs text-muted">{r.label}</p>
                      {m.handles.length > 0 && <p className="mt-1 text-xs text-muted">{m.handles.join(" · ")}</p>}
                    </div>
                  </GlassCard>
                );
              })}
            </div>
            <SectionTitle>Who to go to</SectionTitle>
            <GlassCard padding="none">
              <ul className="divide-y divide-line">
                {rules.escalation.map((e) => (
                  <li key={e.topic} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="text-muted">{e.topic}</span>
                    <span className="shrink-0 font-semibold">{nameForRole(e.to) || roleInfo[e.to].label}</span>
                  </li>
                ))}
              </ul>
            </GlassCard>
            <SectionTitle>Daily order for developers</SectionTitle>
            <GlassCard padding="none">
              <ol className="divide-y divide-line">
                {rules.dailyOrder.map((s, i) => (
                  <li key={s.step} className="flex gap-3 px-4 py-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet/20 text-xs font-bold text-ink">{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold">{s.step}</p>
                      <p className="text-xs text-muted">{s.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="border-t border-line px-4 py-2 text-xs text-muted">
                Each SEO client = {rules.seoHoursPerClient} hrs/month, up to {rules.maxSeoClientsPerDeveloper} per developer ({rules.seoShare}% SEO / {rules.miscShare}% misc). ${rules.bonusPerClientUsd} bonus per client after{" "}
                {rules.bonusAfterSuccessfulClients} successful monthly clients.
              </p>
            </GlassCard>
            <SectionTitle>Priority levels</SectionTitle>
            <div className={CARD_GRID}>
              {(["urgent", "high", "normal", "low"] as WorkPriority[]).map((p) => (
                <div key={p} className="flex items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-4 py-3 text-sm">
                  <Pill color={priorityStyle[p].color}>{priorityStyle[p].label}</Pill>
                  <span className="text-muted">
                    {p === "urgent" && "Critical issues, down websites, client impacting. Do first."}
                    {p === "high" && "Time-sensitive requests. Do next."}
                    {p === "normal" && "Standard requests and tweaks. Do after high."}
                    {p === "low" && "Non-urgent tasks. Do when available."}
                  </span>
                </div>
              ))}
            </div>
          </Fold>
        </Column>
      </Columns>

      <p className="mt-6 flex flex-wrap justify-center gap-x-5 px-1 text-center text-sm">
        <Link href="/notifications" className="pressable inline-flex min-h-11 items-center font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
          Notices &amp; mute
        </Link>
        <Link href="/trash" className="pressable inline-flex min-h-11 items-center font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
          Open Trash
        </Link>
      </p>
    </section>
  );
}
