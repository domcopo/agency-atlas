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
import { autoPublishOwnerSummary, recordHealthSnapshot } from "@/app/actions";
import { AiMeter } from "@/components/cards/AiMeter";
import { AtlasAsks } from "@/components/cards/AtlasAsks";
import { BriefingCard } from "@/components/cards/BriefingCard";
import { OpsBriefingCard } from "@/components/cards/OpsBriefingCard";
import type { Briefing } from "@/lib/types";
import { BriefingButton } from "@/components/forms/AiButtons";
import { ConversationRow } from "@/components/cards/ConversationRow";
import { DetectionRadar } from "@/components/cards/DetectionRadar";
import { FollowUpList } from "@/components/cards/FollowUpList";
import { GlassCard } from "@/components/cards/GlassCard";
import { HomeTabs } from "@/components/cards/HomeTabs";
import { KpiTile } from "@/components/cards/KpiTile";
import { ProspectCard } from "@/components/cards/ProspectCard";
import { PriorityList, priorityTone } from "@/components/cards/ActionRow";
import { PulseStrip, type PulseTile } from "@/components/cards/PulseStrip";
import { MyWork } from "@/components/cards/MyWork";
import { Fold } from "@/components/shell/Fold";
import { myWork } from "@/lib/ops";
import { Pill, Provenance } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import {
  getAiStatus,
  getAtlasQuestions,
  getLatestBriefing,
  getMember,
  usesDatabase,
  getConversations,
  getCoachHints,
  getDetections,
  getDeveloperWork,
  getCompletions,
  getContactLog,
  getGhlSummary,
  getMissionControl,
  getOps,
  getTeam,
  getProspects,
  getProspectsToWork,
  getRosterSummary,
  getTrends,
  showsSamples,
} from "@/lib/data-source";
import { formatShortDate, formatUsd, formatUsdExact } from "@/lib/format";
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
  // Developers get their own list only (the database limits what they can read anyway).
  const me = usesDatabase() ? await getMember() : null;
  if (me?.role === "developer") {
    const items = await getDeveloperWork();
    return (
      <>
        <PageHeader title={`Hi, ${me.name}`} subtitle="Your follow-ups and issues" action={<a href="/account" className="pressable glass flex min-h-11 items-center rounded-2xl px-3 text-xs font-semibold">Account</a>} />
        {me.staffId ? (
          <>
            <MyWork who="me" staff={[]} buckets={myWork(items, undefined)} load={{ people: [], unowned: { open: 0, overdue: 0, clients: 0 } }} canEdit personal />
            {items.some((i) => i.action?.status === "review") && (
              <Link href="/work" className="mt-3 block rounded-2xl border border-violet/40 bg-violet/10 p-3 text-sm">
                <span className="font-semibold text-violet">{items.filter((i) => i.action?.status === "review").length} waiting for a manager&apos;s review.</span>{" "}
                <span className="text-muted">See them on Work.</span>
              </Link>
            )}
          </>
        ) : (
          <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Your login isn&apos;t linked to your team profile yet. Ask the owner to link it.</p>
        )}
      </>
    );
  }
  // Saves today's health scores once a day (owner/manager only; checked on the server).
  // Then (owner only, at most hourly) refreshes the summary your personal dashboard reads.
  const snapshot = recordHealthSnapshot()
    .catch(() => undefined)
    .then(() => autoPublishOwnerSummary())
    .catch(() => undefined);
  // Independent reads run at the same time (each is also shared within this request).
  const [data, summary, coach, ai, briefing, ghl, ops, contacts, team, detections, atlasQuestions] = await Promise.all([
    getMissionControl(),
    getRosterSummary(),
    getCoachHints(),
    getAiStatus(),
    getLatestBriefing(),
    getGhlSummary(),
    getOps(),
    getContactLog(14, 5),
    getTeam(),
    getDetections(),
    getAtlasQuestions(3),
  ]);
  const completions = showsSamples() ? [] : await getCompletions();
  await snapshot;
  const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA");
  const overdueCount = ops.priorities.filter((p) => p.when === "overdue").length;
  const reviewWaiting = ops.actions.filter((a) => a.status === "review").length;
  const doneToday = completions.filter((x) => localDay(x.at) === localDay(new Date().toISOString())).length;
  const prospects = getProspects();
  const prospectById = Object.fromEntries(prospects.map((p) => [p.id, p]));
  const toWork = getProspectsToWork();
  const needsReply = getConversations().filter((c) => c.needsReply);
  const trends = getTrends();
  const real = summary.source !== "demo";
  const member = me;
  const canUseAi = Boolean(member && member.role !== "developer" && ai.configured && ai.tablesReady);
  const samples = showsSamples();
  const staff = team.members.map((m) => ({ id: m.id, name: m.name }));
  const canWork = Boolean(member && member.role !== "developer");
  const openIssues = ops.actions
    .filter((a) => a.kind === "issue" && a.status !== "done")
    .sort((x, y) => (x.priority === y.priority ? (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999") : ["critical", "high", "normal", "low"].indexOf(x.priority) - ["critical", "high", "normal", "low"].indexOf(y.priority)));
  const kindWord = { check_in: "Check-in", call: "Call", message: "Message", email: "Email", meeting: "Meeting", note: "Note" } as const;
  const briefingIsToday = Boolean(briefing && new Date(briefing.createdAt).toDateString() === new Date().toDateString());

  const resultsTab = {
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
        {data.clientResults.length > 0 && (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Lead results</p>
              <Provenance kind="sample" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {data.clientResults.map((kpi) => (
                <KpiTile key={kpi.id} kpi={kpi} />
              ))}
            </div>
            <p className="px-1 text-[11px] text-faint">Sample numbers, shown only in the demo.</p>
          </>
        )}
      </div>
    ),
  };
  const casesTab = {
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
  };
  const leadsTab = {
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
  };
  const chatsTab = {
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
  };

  // Real pipeline from GoHighLevel (read-only copy). Replaces the sample Leads tab.
  const pipelineTab = {
    id: "pipeline",
    label: "Leads",
    icon: <Users aria-hidden />,
    stat: ghl.lastSync ? String(ghl.open.count) : "–",
    statLabel: ghl.lastSync ? "open deals in GoHighLevel" : "GoHighLevel not synced",
    attention: ops.newLeads.length > 0,
    coachSignature: coach.leads.signature,
    panel: ghl.lastSync ? (
      <div className="glass overflow-hidden rounded-3xl">
        <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
          <p className="px-2 py-3">
            <span className="block font-display text-xl font-bold">{ghl.newThisMonth}</span>
            <span className="text-[11px] text-muted">New this month</span>
          </p>
          <p className="px-2 py-3">
            <span className="block font-display text-xl font-bold text-lime">{ghl.wonThisMonth.count}</span>
            <span className="text-[11px] text-muted">Won this month</span>
          </p>
          <p className="px-2 py-3">
            <span className="block font-display text-xl font-bold">{ghl.upcoming7}</span>
            <span className="text-[11px] text-muted">Calls next 7 days</span>
          </p>
        </div>
        <ul className="divide-y divide-line">
          {ghl.byStage.map((st) => (
            <li key={st.stage} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate">{st.stage}</span>
              <span className="shrink-0 text-muted">
                {st.count}
                {st.value > 0 && ` · ${formatUsd(st.value)}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2 text-[11px] text-faint">Real · copied read-only from GoHighLevel.</p>
        <SeeAll href="/sales">Your pipeline</SeeAll>
      </div>
    ) : (
      <GlassCard className="text-sm text-muted">
        No pipeline yet. Press Sync on the Data Safety screen to copy it from GoHighLevel (read-only).
      </GlassCard>
    ),
  };

  // Cases = open client issues (real).
  const issuesTab = {
    id: "issues",
    label: "Cases",
    icon: <Sprout aria-hidden />,
    stat: ops.ready ? String(openIssues.length) : "–",
    statLabel: ops.ready ? "open client issues" : "issues not set up yet",
    attention: openIssues.some((i) => i.priority === "critical" || (i.dueOn !== null && i.dueOn < ops.today)),
    panel: (
      <div className="glass overflow-hidden rounded-3xl">
        {openIssues.length ? (
          <ul className="divide-y divide-line">
            {openIssues.slice(0, 5).map((i) => (
              <li key={i.id}>
                <Link href={i.client ? `/clients/${i.client.slug}#next` : "/"} className="pressable flex items-start gap-2.5 px-4 py-3 hover:bg-white/[0.03]">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${priorityTone[i.priority].dot}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{i.client ? `${i.client.name}: ` : ""}{i.title}</span>
                    <span className="block text-xs text-muted">
                      {i.status === "in_progress" ? "In progress" : i.status === "waiting" ? "Waiting" : "Open"} · {i.ownerName ?? "no owner"}
                      {i.dueOn ? ` · due ${i.dueOn}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted">
            {ops.ready ? "No open issues. Open one from a client's page when something breaks." : "Run the 0006 setup step to start tracking issues."}
          </p>
        )}
      </div>
    ),
  };

  // Chats = the communication log your team records (real). GoHighLevel messages come later.
  const contactsTab = {
    id: "contacts",
    label: "Chats",
    icon: <MessagesSquare aria-hidden />,
    stat: String(contacts.count),
    statLabel: "contacts logged (14 days)",
    panel: (
      <div className="glass overflow-hidden rounded-3xl">
        {contacts.recent.length ? (
          <ul className="divide-y divide-line">
            {contacts.recent.map((r, i) => (
              <li key={`${r.date}-${i}`}>
                <Link href={r.client ? `/clients/${r.client.slug}` : "/clients"} className="pressable block px-4 py-3 hover:bg-white/[0.03]">
                  <span className="block text-sm font-semibold">
                    {r.client?.name ?? "Client"} <span className="font-normal text-muted">· {kindWord[r.kind]} · {formatShortDate(`${r.date}T12:00:00Z`)}</span>
                  </span>
                  {r.note && <span className="mt-0.5 line-clamp-2 block break-words text-xs text-muted">{r.note}</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted">No contacts logged in the last 14 days. Log calls, messages and check-ins on a client&apos;s page.</p>
        )}
        <p className="border-t border-line px-4 py-2 text-[11px] text-faint">Logged by your team. GoHighLevel messages aren&apos;t connected.</p>
      </div>
    ),
  };

  const tabs = samples ? [resultsTab, casesTab, leadsTab, chatsTab] : [resultsTab, issuesTab, pipelineTab, contactsTab];

  // Top numbers (real data only). Each names its source; "–" = not connected or not synced yet.
  const overdueItems = ops.actions.filter((a) => a.status !== "done" && a.dueOn !== null && a.dueOn < ops.today).length;
  const synced = Boolean(ghl.lastSync);
  const pulse: PulseTile[] = [
    { label: "Monthly plans", value: `$${(summary.activeMrr / 1000).toFixed(1)}k`, source: "Client plans · not payments", href: "/clients", tone: "teal" },
    { label: "Active clients", value: String(summary.activeCount), source: "Client list", href: "/clients" },
    { label: "Overdue items", value: ops.ready ? String(overdueItems) : "–", source: "Follow-ups + issues", href: "/work", tone: overdueItems ? "rose" : "plain" },
    { label: "At-risk clients", value: String(ops.counts.at_risk), source: "Health rules", href: "/clients#risk", tone: ops.counts.at_risk ? "rose" : "plain" },
  ];
  // Hidden until tapped: sales numbers matter less than client work on Home.
  const pulseHidden: PulseTile[] = [
    { label: "Pipeline value", value: synced ? formatUsd(ghl.open.value) : "–", source: synced ? "Open deals · not revenue" : "Not synced", href: "/sales", tone: "amber" },
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

      {ai.tablesReady && (ai.level === "warning" || ai.level === "blocked") && (
        <Link href="/safety#ai" className="mb-3 block rounded-2xl border border-rose/40 bg-rose/10 p-3 text-sm">
          <span className="font-semibold text-rose">{ai.level === "blocked" ? "AI budget used up." : `AI budget ${ai.pct}% used.`}</span>{" "}
          <span className="text-muted">
            ${ai.spentUsd.toFixed(2)} of ${ai.budgetUsd.toFixed(2)} this month.{ai.level === "blocked" ? " AI is paused until the 1st." : ""} Tap to review.
          </span>
        </Link>
      )}

      {!samples && <PulseStrip tiles={pulse} hidden={pulseHidden} hiddenLabel="pipeline value" />}

      {reviewWaiting > 0 && (
        <Link href="/work/orders" className="mb-3 block rounded-2xl border border-violet/40 bg-violet/10 p-3 text-sm">
          <span className="font-semibold text-violet">{reviewWaiting} waiting for your review.</span> <span className="text-muted">Approve or send back on Work orders.</span>
        </Link>
      )}

      <HomeTabs tabs={tabs} />

      <div className="mt-3">
        <DetectionRadar detections={detections} coachSignature={coach.radar.signature} healthyCount={samples ? undefined : ops.counts.healthy} />
      </div>

      {!samples && (
        <Fold
          label="Today's priorities"
          title="Today's priorities"
          summary={
            ops.ready
              ? ops.priorities[0]
                ? <>Next: <span className="font-semibold">{ops.priorities[0].title}</span></>
                : "Nothing needs action right now."
              : "Turns on after the 0006 setup step."
          }
          badge={
            <>
              <span className={overdueCount ? "font-semibold text-rose" : ""}>{overdueCount} overdue</span> · {doneToday} done
            </>
          }
        >
          {ops.ready ? (
            <PriorityList items={ops.priorities} staff={staff} canEdit={canWork} limit={5} empty="Nothing needs action right now." />
          ) : (
            <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">
              Owners and next actions turn on after one setup step: run{" "}
              <span className="font-mono text-xs">0006_owners_and_next_actions.sql</span> in Supabase.
            </p>
          )}
        </Fold>
      )}

      {(canUseAi || briefing) && (
        <Fold
          label="AI briefing"
          title="AI briefing"
          summary={
            briefing
              ? <>{briefingIsToday ? "" : "Earlier: "}{briefing.content.headline}</>
              : "No briefing yet today."
          }
          badge={ai.tablesReady ? `$${ai.spentUsd.toFixed(2)} / $${ai.budgetUsd.toFixed(0)}` : undefined}
        >
          {ai.tablesReady && (
            <Link href="/safety#ai" className="mb-2.5 block">
              <AiMeter ai={ai} compact />
            </Link>
          )}
          {briefing &&
            ("version" in briefing.content && briefing.content.version === 2 ? (
              <OpsBriefingCard
                briefing={briefing.content}
                createdAt={briefing.createdAt}
                isToday={briefingIsToday}
                owners={new Map(ops.clients.map((c) => [c.id, c.ownerName]))}
                existing={new Set(ops.actions.filter((a) => a.status !== "done" && a.client).map((a) => `${a.client!.slug}|${a.title.toLowerCase()}`))}
                canAdd={canWork && ops.ready}
              />
            ) : (
              <BriefingCard briefing={briefing.content as Briefing} createdAt={briefing.createdAt} isToday={briefingIsToday} />
            ))}
          {canUseAi && (
            <div className={briefing ? "mt-2.5" : ""}>
              <BriefingButton label={briefingIsToday ? "Refresh today's briefing" : "Get today's briefing"} disabled={ai.level === "blocked"} />
            </div>
          )}
        </Fold>
      )}

      <AtlasAsks questions={atlasQuestions} today={data.today} />

      {data.followUps.length > 0 && (
        <>
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
        </>
      )}

      {samples && (
        <>
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
            <TrendingUp aria-hidden className="size-3" />{" "}
            {samples ? "Real items come from your client list; others are samples." : "From your client list."}
          </p>
        </>
      )}
    </>
  );
}
