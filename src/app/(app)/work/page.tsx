import { Award, Crown, Headset, MessageSquareText, Wrench } from "lucide-react";
import type { Metadata } from "next";
import { GlassCard } from "@/components/cards/GlassCard";
import { WorkOrderCard, priorityStyle } from "@/components/cards/WorkOrderCard";
import { Pill, Provenance } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getSampleDevelopers, getTeam, getToday, getWorkOrders, getWorkRules, showsSamples } from "@/lib/data-source";
import { cn } from "@/lib/format";
import type { TeamRole, WorkPriority } from "@/lib/types";

export const metadata: Metadata = { title: "Work" };

const roleInfo: Record<TeamRole, { label: string; icon: typeof Crown; color: string }> = {
  founder: { label: "Founder · final decisions", icon: Crown, color: "text-rose bg-rose/12" },
  client_comms: { label: "Client communication & work orders", icon: MessageSquareText, color: "text-amber bg-amber/12" },
  client_manager: { label: "Client manager & calls", icon: Headset, color: "text-violet bg-violet/12" },
  seo_developer: { label: "SEO developer", icon: Wrench, color: "text-teal bg-teal/12" },
};

export default async function WorkPage() {
  const today = getToday();
  const samples = showsSamples();
  const orders = getWorkOrders();
  const rules = getWorkRules();
  const devs = getSampleDevelopers();
  const devName = Object.fromEntries(devs.map((d) => [d.id, d.name]));
  const team = await getTeam();
  const realTeam = team.source !== "demo";
  const nameForRole = (role: TeamRole) => team.members.filter((m) => m.role === role).map((m) => m.name).join(" or ");

  const open = orders.filter((o) => o.status !== "done");
  const needsAttention = open.filter((o) => o.priority === "urgent" || o.due < today || o.lastTouched < today);
  const rest = open.filter((o) => !needsAttention.includes(o));
  const done = orders.filter((o) => o.status === "done");
  const stats = [
    { label: "Open", value: open.length, tone: "" },
    { label: "Urgent", value: open.filter((o) => o.priority === "urgent").length, tone: "text-rose" },
    { label: "Overdue", value: open.filter((o) => o.due < today).length, tone: "text-rose" },
    { label: "Not touched today", value: open.filter((o) => o.lastTouched < today).length, tone: "text-amber" },
  ];

  return (
    <>
      <PageHeader title="Work" subtitle="Oversee work orders and developer load" />

      <div className="flex gap-3 rounded-2xl border border-sky/30 bg-sky/8 p-3.5 text-xs text-muted">
        <Wrench aria-hidden className="mt-0.5 size-4 shrink-0 text-sky" />
        {samples ? (
          <p>
            <span className="font-semibold text-ink">Work still happens in GoHighLevel.</span> This is the demo: the
            work orders and developer load below are made up, on fictional clients.
          </p>
        ) : (
          <p>
            <span className="font-semibold text-ink">Work orders aren&apos;t connected yet.</span> Work still happens
            in GoHighLevel. Your real queue and developer load will show here once work orders are connected (a
            later step, with your approval). Below are your real team, rules and daily order.
          </p>
        )}
      </div>

      {samples && (
        <>
          <SectionTitle aside={<Provenance kind="sample" />}>Today at a glance</SectionTitle>
          <GlassCard className="grid grid-cols-4 gap-1 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <p className={cn("font-display text-2xl font-bold", s.value > 0 && s.tone)}>{s.value}</p>
                <p className="text-[10px] leading-tight text-muted">{s.label}</p>
              </div>
            ))}
          </GlassCard>
          <p className="mt-1.5 px-1 text-[11px] text-faint">Goal: every work order touched daily.</p>

          <SectionTitle>Needs attention</SectionTitle>
          <ul className="space-y-2.5">
            {needsAttention.map((o) => (
              <li key={o.id}>
                <WorkOrderCard order={o} today={today} assigneeName={devName[o.assignee] ?? "Unassigned"} />
              </li>
            ))}
          </ul>

          {rest.length > 0 && (
            <>
              <SectionTitle>On track</SectionTitle>
              <ul className="space-y-2.5">
                {rest.map((o) => (
                  <li key={o.id}>
                    <WorkOrderCard order={o} today={today} assigneeName={devName[o.assignee] ?? "Unassigned"} />
                  </li>
                ))}
              </ul>
            </>
          )}

          <SectionTitle aside={<Provenance kind="sample" />}>Developer load</SectionTitle>
          <div className="space-y-2.5">
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
                    <div className="mb-1 flex justify-between text-[11px] text-muted">
                      <span>
                        SEO clients {seo} / {rules.maxSeoClientsPerDeveloper}
                      </span>
                      <span>
                        {d.load?.hoursLogged ?? 0} hrs logged · SEO budget {seo * rules.seoHoursPerClient} hrs
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={cn("h-full rounded-full", seo >= rules.maxSeoClientsPerDeveloper ? "bg-amber" : "bg-teal")}
                        style={{ width: `${(seo / rules.maxSeoClientsPerDeveloper) * 100}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted">
                    {d.openOrders} open work orders
                    {d.overdue > 0 && <span className="font-semibold text-rose"> · {d.overdue} overdue</span>}
                    {d.untouchedToday > 0 && <span className="text-amber"> · {d.untouchedToday} not touched today</span>}
                  </p>
                </GlassCard>
              );
            })}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-faint">
            Pay and bonus details will be visible to the owner only once sign-in exists (Phase 2).
          </p>
        </>
      )}

      <SectionTitle aside={<Provenance kind={realTeam ? "real" : "demo"} what="your team" />}>Your team</SectionTitle>
      <div className="space-y-2.5">
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
                {m.handles.length > 0 && <p className="mt-1 text-[11px] text-faint">{m.handles.join(" · ")}</p>}
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
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet/20 text-xs font-bold text-violet">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold">{s.step}</p>
                <p className="text-xs text-muted">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
          Each SEO client = {rules.seoHoursPerClient} hrs/month, up to {rules.maxSeoClientsPerDeveloper} per developer
          ({rules.seoShare}% SEO / {rules.miscShare}% misc). ${rules.bonusPerClientUsd} bonus per client after{" "}
          {rules.bonusAfterSuccessfulClients} successful monthly clients.
        </p>
      </GlassCard>

      <SectionTitle>Priority levels</SectionTitle>
      <div className="space-y-2">
        {(["urgent", "high", "normal", "low"] as WorkPriority[]).map((p) => (
          <div key={p} className="flex items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-3.5 py-2.5 text-sm">
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

      {done.length > 0 && (
        <>
          <SectionTitle>Recently done</SectionTitle>
          <ul className="space-y-2.5">
            {done.map((o) => (
              <li key={o.id}>
                <WorkOrderCard order={o} today={today} assigneeName={devName[o.assignee] ?? "Unassigned"} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
