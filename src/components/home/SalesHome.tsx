// Sales Home: lead follow-ups due, newest leads, appointments. Read-only copies from
// GoHighLevel (synced by the owner); Atlas never sends, books or changes anything there.
import Link from "next/link";
import { PriorityList } from "@/components/cards/ActionRow";
import { PulseStrip } from "@/components/cards/PulseStrip";
import { SectionTitle } from "@/components/shell/PageHeader";
import { formatUsd } from "@/lib/format";
import type { SalesAppointment, SalesView } from "@/lib/home-layouts";
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

export function SalesHome({ view, leadItems, staff, canEdit, synced }: { view: SalesView; leadItems: PriorityItem[]; staff: { id: string; name: string }[]; canEdit: boolean; synced: boolean }) {
  return (
    <>
      {!synced && <p className="mb-3 rounded-2xl border border-amber/40 bg-amber/5 px-3 py-2 text-xs text-amber">GoHighLevel hasn&apos;t been synced yet, so leads and appointments are empty. The owner syncs on Data Safety.</p>}
      <PulseStrip
        tiles={[
          { label: "New leads (7 days)", value: synced ? String(view.newLeads.length) : "–", source: "GoHighLevel", href: "/sales", tone: "teal" },
          { label: "Follow-ups due", value: String(view.followUpsDue), source: "Lead follow-ups (app only)", href: "/sales", tone: view.followUpsDue ? "amber" : "plain" },
          { label: "Appointments today", value: synced ? String(view.appointmentsToday.length) : "–", source: "GoHighLevel calendars", href: "/sales" },
          { label: "Open pipeline", value: synced ? formatUsd(view.openValue) : "–", source: "Open deals · not revenue", href: "/sales", tone: "amber" },
        ]}
      />

      <SectionTitle aside={<Link href="/sales" className="text-xs text-violet">Sales</Link>}>Lead follow-ups</SectionTitle>
      <PriorityList items={leadItems} staff={staff} canEdit={canEdit} limit={6} empty="No lead follow-ups. Add one from a lead on the Sales tab." />

      <SectionTitle aside="Times and calendar only">Appointments today</SectionTitle>
      {view.appointmentsToday.length ? <Appointments items={view.appointmentsToday} when={time} /> : <p className="glass rounded-2xl px-4 py-3 text-sm text-muted">None today.</p>}

      {view.appointmentsWeek.length > 0 && (
        <>
          <SectionTitle>Next 7 days</SectionTitle>
          <Appointments items={view.appointmentsWeek} when={dayTime} />
        </>
      )}

      <SectionTitle aside={<Link href="/sales" className="text-xs text-violet">All leads</Link>}>Newest leads</SectionTitle>
      {view.newLeads.length ? (
        <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {view.newLeads.slice(0, 6).map((d) => (
            <li key={d.ghlId} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{d.name}</span>
                <span className="block text-[11px] text-muted">
                  {d.stage} · added {(d.createdAt ?? "").slice(0, 10)}
                </span>
              </span>
              {d.value > 0 && <span className="shrink-0 text-xs text-muted">{formatUsd(d.value)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="glass rounded-2xl px-4 py-3 text-sm text-muted">No new leads in the last 7 days.</p>
      )}
      <p className="mt-2 px-1 text-[11px] text-faint">Read-only from GoHighLevel. Atlas never messages, books or changes anything there.</p>
    </>
  );
}
