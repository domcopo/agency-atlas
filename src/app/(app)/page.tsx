import {
  ArrowRight,
  BadgeDollarSign,
  CalendarCheck,
  CheckCircle2,
  FileText,
  MessagesSquare,
  NotebookPen,
  PauseCircle,
  ShieldCheck,
  Sprout,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { AtlasAsks } from "@/components/cards/AtlasAsks";
import { ConversationRow } from "@/components/cards/ConversationRow";
import { DetectionRadar } from "@/components/cards/DetectionRadar";
import { FollowUpList } from "@/components/cards/FollowUpList";
import { GlassCard } from "@/components/cards/GlassCard";
import { HomeTabs } from "@/components/cards/HomeTabs";
import { KpiTile } from "@/components/cards/KpiTile";
import { ProspectCard } from "@/components/cards/ProspectCard";
import { Pill, Provenance } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import {
  getAtlasQuestions,
  getConversations,
  getCoachHints,
  getDetections,
  getMissionControl,
  getProspects,
  getProspectsToWork,
  getRosterSummary,
  getTrends,
} from "@/lib/data-source";
import { formatShortDate, formatUsdExact } from "@/lib/format";
import type { ActivityKind } from "@/lib/types";

const activityIcon: Record<ActivityKind, { icon: typeof CalendarCheck; color: string }> = {
  client_signed: { icon: UserPlus, color: "text-lime bg-lime/12" },
  client_paused: { icon: PauseCircle, color: "text-amber bg-amber/12" },
  call_booked: { icon: CalendarCheck, color: "text-teal bg-teal/12" },
  proposal_sent: { icon: FileText, color: "text-violet bg-violet/12" },
  work_done: { icon: CheckCircle2, color: "text-sky bg-sky/12" },
  note_added: { icon: NotebookPen, color: "text-sky bg-sky/12" },
};

function SeeAll({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="pressable flex min-h-11 items-center justify-center gap-1 border-t border-line text-sm font-semibold text-violet"
    >
      {children}
      <ArrowRight aria-hidden className="size-4" />
    </Link>
  );
}

export default async function MissionControlPage() {
  const data = await getMissionControl();
  const summary = await getRosterSummary();
  const prospects = getProspects();
  const prospectById = Object.fromEntries(prospects.map((p) => [p.id, p]));
  const toWork = getProspectsToWork();
  const needsReply = getConversations().filter((c) => c.needsReply);
  const trends = getTrends();
  const real = summary.source !== "demo";
  const coach = await getCoachHints();

  const tabs = [
    {
      id: "results",
      label: "Results",
      icon: <BadgeDollarSign aria-hidden />,
      stat: `$${(summary.activeMrr / 1000).toFixed(1)}k`,
      statLabel: `a month from ${summary.activeCount} active clients`,
      panel: (
        <div className="space-y-3">
          <GlassCard className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Your clients</p>
              <Provenance kind={real ? "real" : "demo"} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(["high", "mid", "low"] as const).map((t) => (
                <Link key={t} href={`/clients#${t}`} className="pressable rounded-2xl bg-white/[0.04] px-1 py-2">
                  <span className="block font-display text-lg font-bold">{summary.tiers[t].count}</span>
                  <span className="block text-[10px] text-muted">
                    {t === "high" ? "$500+" : t === "mid" ? "$150–499" : "Under $150"}
                  </span>
                  <span className="block text-[11px] font-semibold">{formatUsdExact(summary.tiers[t].mrr)}</span>
                </Link>
              ))}
            </div>
            <p className="text-xs text-muted">
              {summary.pausedCount} paused ({formatUsdExact(summary.pausedMrr)}/mo on hold) · avg{" "}
              {summary.avgMonthsActive} months with you
            </p>
          </GlassCard>
          <div className="flex items-center justify-between px-1">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Lead results</p>
            <Provenance kind="sample" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {data.clientResults.map((kpi) => (
              <KpiTile key={kpi.id} kpi={kpi} />
            ))}
          </div>
          <p className="px-1 text-[11px] text-faint">
            Lead results come from GoHighLevel (read-only) in Phase 3. Until then these are sample numbers.
          </p>
        </div>
      ),
    },
    {
      id: "case",
      label: "Cases",
      icon: <Sprout aria-hidden />,
      stat: String(trends.length),
      statLabel: "growth trends",
      panel: (
        <div className="glass overflow-hidden rounded-3xl">
          <ul className="divide-y divide-line">
            {trends.slice(0, 3).map((t) => (
              <li key={t.id}>
                <Link href={`/growth#${t.id}`} className="pressable block px-4 py-3 hover:bg-white/[0.03]">
                  <p className="text-sm font-semibold">{t.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.finding}</p>
                </Link>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2 text-[11px] text-faint">Sample trends from the Business Dex.</p>
          <SeeAll href="/growth">Open Growth Lab</SeeAll>
        </div>
      ),
    },
    {
      id: "followups",
      label: "Leads",
      icon: <Users aria-hidden />,
      stat: String(toWork.all.length),
      statLabel: "prospects to work",
      attention: toWork.overdue.length > 0,
      coachSignature: coach.leads.signature,
      panel: (
        <div className="glass overflow-hidden rounded-3xl">
          <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
            <p className="px-2 py-3">
              <span className="block font-display text-xl font-bold text-rose">{toWork.overdue.length}</span>
              <span className="text-[11px] text-muted">Overdue</span>
            </p>
            <p className="px-2 py-3">
              <span className="block font-display text-xl font-bold">{toWork.dueToday.length}</span>
              <span className="text-[11px] text-muted">Due today</span>
            </p>
            <p className="px-2 py-3">
              <span className="block font-display text-xl font-bold text-violet">{toWork.uncontacted.length}</span>
              <span className="text-[11px] text-muted">Never contacted</span>
            </p>
          </div>
          <ul className="space-y-2 p-3">
            {toWork.all.slice(0, 4).map((p) => (
              <li key={p.id}>
                <ProspectCard prospect={p} today={data.today} />
              </li>
            ))}
          </ul>
          <SeeAll href="/sales">All prospects</SeeAll>
        </div>
      ),
    },
    {
      id: "conversations",
      label: "Chats",
      icon: <MessagesSquare aria-hidden />,
      stat: String(needsReply.length),
      statLabel: "need a reply",
      attention: needsReply.length > 0,
      coachSignature: coach.chats.signature,
      panel: (
        <div className="glass overflow-hidden rounded-3xl">
          <ul className="divide-y divide-line">
            {needsReply.slice(0, 3).map((c) => (
              <ConversationRow key={c.id} conversation={c} name={prospectById[c.prospectId]?.name ?? "Unknown"} />
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
            Sample messages. Read-only: reply in GoHighLevel; this app never sends.
          </p>
          <SeeAll href="/sales#conversations">All conversations</SeeAll>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Mission Control"
        subtitle={data.weekLabel}
        action={
          <Link
            href="/safety"
            aria-label="Data Safety"
            className="pressable glass flex size-11 items-center justify-center rounded-2xl text-lime"
          >
            <ShieldCheck aria-hidden className="size-5" />
          </Link>
        }
      />

      <HomeTabs tabs={tabs} />

      <div className="mt-3">
        <DetectionRadar detections={await getDetections()} coachSignature={coach.radar.signature} />
      </div>

      <AtlasAsks questions={await getAtlasQuestions(3)} today={data.today} />

      <SectionTitle aside="Internal only, never sent">Top follow-ups today</SectionTitle>
      <FollowUpList
        items={data.followUps.slice(0, 3)}
        today={data.today}
        prospects={Object.fromEntries(
          data.followUps.map((f) => [
            f.prospectId,
            { name: prospectById[f.prospectId]?.name ?? "Unknown", grade: prospectById[f.prospectId]?.grade.letter ?? "D" },
          ]),
        )}
      />

      <SectionTitle>Recent activity</SectionTitle>
      <ol className="glass divide-y divide-line rounded-3xl">
        {data.activity.slice(0, 5).map((item) => {
          const { icon: Icon, color } = activityIcon[item.kind];
          const body = (
            <>
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
                <Icon aria-hidden className="size-4.5" />
              </span>
              <p className="min-w-0 flex-1 text-sm">{item.title}</p>
              {!item.isSynthetic && real && <Pill color="teal">Real</Pill>}
              <time dateTime={item.at} className="shrink-0 text-xs text-faint">
                {formatShortDate(item.at)}
              </time>
            </>
          );
          return (
            <li key={item.id}>
              {item.href ? (
                <Link href={item.href} className="pressable flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 flex items-center gap-1 px-1 text-[11px] text-faint">
        <TrendingUp aria-hidden className="size-3" /> Real items come from your client list; others are samples.
      </p>
    </>
  );
}
