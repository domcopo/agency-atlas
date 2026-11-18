// Sales Home (owner and managers, Home switcher): the same sales-pipeline numbers as the
// Sales tab (SALES_SIMPLIFY_PLAN, 2026-11-17): not contacted, follow-ups due, appointments,
// reach-outs today, then follow-ups, appointments and the newest sales leads.
// Read-only copies from GoHighLevel; Atlas never sends, books or changes anything there.
import Link from "next/link";
import { PriorityList } from "@/components/cards/ActionRow";
import { PulseStrip } from "@/components/cards/PulseStrip";
import { LeadRow } from "@/components/sales/LeadRow";
import { SectionTitle } from "@/components/shell/PageHeader";
import type { SalesAppointment, SalesView } from "@/lib/home-layouts";
import type { LeadTouch, SalesPipeline } from "@/lib/sales";
import { isHot } from "@/lib/sales";
import type { PriorityItem } from "@/lib/types";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const dayTime = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function Appointments({ items, when }: { items: SalesAppointment[]; when: (iso: string) => string }) {
  return (
    <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
      {items.slice(0, 8).map((a, i) => (
        <li key={`${a.startsAt}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="font-semibold">{when(a.startsAt)}</span>
          <span className="truncate text-xs text-muted">{a.calendar ?? "Appointment"}</span>
        </li>
      ))}
    </ul>
  );
}

export function SalesHome({
  view,
  leadItems,
  staff,
  canEdit,
  setup,
  owner,
  pipelines,
  lastByLead,
  today,
}: {
  view: SalesView;
  /** Follow-up rows on sales-pipeline leads (Done · Reschedule · Assign · Edit). */
  leadItems: PriorityItem[];
  staff: { id: string; name: string }[];
  canEdit: boolean;
  /** "ready": sales pipelines picked; otherwise what's missing. */
  setup: "ready" | "no_pipelines" | "needs_sql";
  owner: boolean;
  pipelines: SalesPipeline[];
  lastByLead: Map<string, LeadTouch>;
  today: string;
}) {
  if (setup !== "ready") {
    return setup === "no_pipelines" && owner ? (
      <Link href="/sales/setup" className="pressable glass block rounded-3xl p-4 text-sm">
        <span className="font-semibold text-violet">Set up Sales →</span> <span className="text-muted">Pick your sales pipelines first; this Home is built from them.</span>
      </Link>
    ) : (
      <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">{setup === "needs_sql" ? "Sales needs one setup step first (0020 SQL)." : "The owner hasn't picked the sales pipelines yet."}</p>
    );
  }
  return (
    <>
      <PulseStrip
        tiles={[
          { label: "Not contacted", value: String(view.notContacted), source: "Open sales leads, no reach-out logged", href: "/sales", tone: view.notContacted ? "amber" : "plain" },
          { label: "Follow-ups due", value: String(view.followUpsDue), source: "Lead follow-ups (app only)", href: "/sales#follow-ups", tone: view.followUpsDue ? "amber" : "plain" },
          { label: "Appointments today", value: String(view.appointmentsToday.length), source: "GoHighLevel calendars", href: "/sales" },
          { label: "Reach-outs today", value: String(view.touchesToday), source: "Logged in Atlas", href: "/sales", tone: "teal" },
        ]}
      />

      <SectionTitle aside={<Link href="/sales#follow-ups" className="text-xs text-violet">Sales</Link>}>Follow-ups</SectionTitle>
      <PriorityList items={leadItems} staff={staff} canEdit={canEdit} limit={6} empty="No lead follow-ups. Add one from a lead's page." />

      <SectionTitle aside="Times and calendar only">Appointments today</SectionTitle>
      {view.appointmentsToday.length ? <Appointments items={view.appointmentsToday} when={time} /> : <p className="glass rounded-2xl px-4 py-3 text-sm text-muted">None today.</p>}

      {view.appointmentsWeek.length > 0 && (
        <>
          <SectionTitle>Next 7 days</SectionTitle>
          <Appointments items={view.appointmentsWeek} when={dayTime} />
        </>
      )}

      <SectionTitle aside={<Link href="/sales" className="text-xs text-violet">All leads</Link>}>Newest sales leads</SectionTitle>
      {view.newLeads.length ? (
        <ol className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {view.newLeads.slice(0, 6).map((l) => (
            <li key={l.ghlId}>
              <LeadRow lead={l} last={lastByLead.get(l.ghlId)} hot={isHot(l, pipelines)} today={today} canTouch={canEdit} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="glass rounded-2xl px-4 py-3 text-sm text-muted">No new sales leads in the last 7 days.</p>
      )}
      <p className="mt-2 px-1 text-[11px] text-faint">Read-only from GoHighLevel. Atlas never messages, books or changes anything there.</p>
    </>
  );
}
