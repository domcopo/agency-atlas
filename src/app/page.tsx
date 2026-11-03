import {
  ArrowRight,
  BadgeDollarSign,
  CalendarCheck,
  FileSignature,
  Handshake,
  MessagesSquare,
  NotebookPen,
  TrendingUp,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { AlertCard } from "@/components/cards/AlertCard";
import { ConversationRow } from "@/components/cards/ConversationRow";
import { FollowUpList } from "@/components/cards/FollowUpList";
import { HomeTabs } from "@/components/cards/HomeTabs";
import { KpiTile } from "@/components/cards/KpiTile";
import { LeadCard } from "@/components/cards/LeadCard";
import { DataModeBadge } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import {
  DATA_MODE,
  getConversations,
  getLeads,
  getLeadsToWork,
  getMissionControl,
} from "@/lib/data-source";
import { formatShortDate } from "@/lib/format";
import type { ActivityKind } from "@/lib/types";

const activityIcon: Record<ActivityKind, { icon: typeof CalendarCheck; color: string }> = {
  lead_new: { icon: UserPlus, color: "text-violet bg-violet/12" },
  appointment_set: { icon: CalendarCheck, color: "text-teal bg-teal/12" },
  offer_made: { icon: BadgeDollarSign, color: "text-amber bg-amber/12" },
  contract_signed: { icon: FileSignature, color: "text-lime bg-lime/12" },
  deal_assigned: { icon: Handshake, color: "text-lime bg-lime/12" },
  deal_fell_through: { icon: XCircle, color: "text-rose bg-rose/12" },
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

export default function MissionControlPage() {
  const data = getMissionControl();
  const leads = getLeads();
  const leadById = Object.fromEntries(leads.map((l) => [l.id, l]));
  const toWork = getLeadsToWork(data.today);
  const conversations = getConversations();
  const needsReply = conversations.filter((c) => c.needsReply);
  const contracts = data.sales.find((k) => k.id === "k_contracts");

  const tabs = [
    {
      id: "sales",
      label: "Sales",
      icon: <TrendingUp aria-hidden />,
      stat: String(contracts?.value ?? "—"),
      statLabel: "contracts",
      panel: (
        <div>
          <div className="grid grid-cols-2 gap-2.5">
            {data.sales.map((kpi) => (
              <KpiTile key={kpi.id} kpi={kpi} />
            ))}
          </div>
          <p className="mt-2 px-1 text-[11px] text-faint">Compared with last week. Mock numbers.</p>
        </div>
      ),
    },
    {
      id: "followups",
      label: "Follow-ups",
      icon: <Users aria-hidden />,
      stat: String(toWork.all.length),
      statLabel: "leads to work",
      attention: toWork.overdue.length > 0,
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
            {toWork.all.slice(0, 4).map((l) => (
              <li key={l.id}>
                <LeadCard lead={l} today={data.today} />
              </li>
            ))}
          </ul>
          <SeeAll href="/leads">All leads</SeeAll>
        </div>
      ),
    },
    {
      id: "conversations",
      label: "Conversations",
      icon: <MessagesSquare aria-hidden />,
      stat: String(needsReply.length),
      statLabel: "need a reply",
      attention: needsReply.length > 0,
      panel: (
        <div className="glass overflow-hidden rounded-3xl">
          <ul className="divide-y divide-line">
            {needsReply.slice(0, 3).map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                leadName={leadById[c.leadId]?.sellerName ?? "Unknown lead"}
              />
            ))}
          </ul>
          <SeeAll href="/conversations">All conversations</SeeAll>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Mission Control" subtitle={data.weekLabel} action={<DataModeBadge mode={DATA_MODE} />} />

      <HomeTabs tabs={tabs} />

      <SectionTitle aside="Internal only, never sent">Top follow-ups today</SectionTitle>
      <FollowUpList
        items={data.followUps}
        today={data.today}
        leads={Object.fromEntries(
          data.followUps.map((f) => [
            f.leadId,
            { name: leadById[f.leadId]?.sellerName ?? "Unknown lead", grade: leadById[f.leadId]?.grade.letter ?? "D" },
          ]),
        )}
      />

      <SectionTitle>Alerts</SectionTitle>
      <div className="space-y-2.5">
        {data.alerts.map((a) => (
          <AlertCard key={a.id} alert={a} />
        ))}
      </div>

      <SectionTitle>Recent activity</SectionTitle>
      <ol className="glass divide-y divide-line rounded-3xl">
        {data.activity.map((item) => {
          const { icon: Icon, color } = activityIcon[item.kind];
          return (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
                <Icon aria-hidden className="size-4.5" />
              </span>
              <p className="min-w-0 flex-1 text-sm">{item.title}</p>
              <time dateTime={item.at} className="shrink-0 text-xs text-faint">
                {formatShortDate(item.at)}
              </time>
            </li>
          );
        })}
      </ol>
    </>
  );
}
