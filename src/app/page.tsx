import {
  BadgeDollarSign,
  CalendarCheck,
  CalendarX,
  NotebookPen,
  ThumbsDown,
  UserPlus,
} from "lucide-react";
import { AlertCard } from "@/components/cards/AlertCard";
import { FollowUpList } from "@/components/cards/FollowUpList";
import { KpiTile } from "@/components/cards/KpiTile";
import { DataModeBadge } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { DATA_MODE, getClients, getMissionControl } from "@/lib/data-source";
import { formatShortDate } from "@/lib/format";
import type { ActivityKind } from "@/lib/types";

const activityIcon: Record<ActivityKind, { icon: typeof CalendarCheck; color: string }> = {
  appointment_booked: { icon: CalendarCheck, color: "text-teal bg-teal/12" },
  deal_won: { icon: BadgeDollarSign, color: "text-lime bg-lime/12" },
  deal_lost: { icon: ThumbsDown, color: "text-rose bg-rose/12" },
  lead_new: { icon: UserPlus, color: "text-violet bg-violet/12" },
  no_show: { icon: CalendarX, color: "text-amber bg-amber/12" },
  note_added: { icon: NotebookPen, color: "text-sky bg-sky/12" },
};

export default function MissionControlPage() {
  const data = getMissionControl();
  const clientNames = Object.fromEntries(getClients().map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        title="Mission Control"
        subtitle={data.weekLabel}
        action={<DataModeBadge mode={DATA_MODE} />}
      />

      <section aria-label="Agency KPIs" className="grid grid-cols-2 gap-3">
        {data.kpis.map((kpi) => (
          <KpiTile key={kpi.id} kpi={kpi} />
        ))}
      </section>

      <SectionTitle>Alerts</SectionTitle>
      <div className="space-y-2.5">
        {data.alerts.map((a) => (
          <AlertCard key={a.id} alert={a} />
        ))}
      </div>

      <SectionTitle aside="Internal only — never sent">Follow-up priorities</SectionTitle>
      <FollowUpList items={data.followUps} clientNames={clientNames} />

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
