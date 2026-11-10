// Client care Home (client managers): my clients that need attention, replies waiting,
// promises due, my follow-ups. Uses the same data and rules as everywhere else.
import Link from "next/link";
import { PriorityList } from "@/components/cards/ActionRow";
import { PulseStrip } from "@/components/cards/PulseStrip";
import { SectionTitle } from "@/components/shell/PageHeader";
import { cn } from "@/lib/format";
import type { ClientCareView } from "@/lib/home-layouts";
import { promiseMissed } from "@/lib/ops";

export function ClientCareHome({ view, staff, canEdit, today, linked }: { view: ClientCareView; staff: { id: string; name: string }[]; canEdit: boolean; today: string; linked: boolean }) {
  const atRisk = view.attention.filter((a) => a.state === "at_risk").length;
  return (
    <>
      {!linked && <p className="mb-3 rounded-2xl border border-line px-3 py-2 text-xs text-muted">Your login isn&apos;t linked to a team profile, so this shows every client. Ask the owner to link it.</p>}
      <PulseStrip
        tiles={[
          { label: linked ? "My clients" : "Clients", value: String(view.mine.length), source: "Client list", href: "/clients" },
          { label: "At risk", value: String(atRisk), source: "Health rules", href: "/clients#risk", tone: atRisk ? "rose" : "plain" },
          { label: "Waiting for reply", value: String(view.replyWaiting.length), source: "GoHighLevel (times)", href: "/clients", tone: view.replyWaiting.length ? "amber" : "plain" },
          { label: "Check-ins overdue", value: String(view.checkInsOverdue), source: "Check-in rhythm", href: "/clients", tone: view.checkInsOverdue ? "amber" : "plain" },
        ]}
      />

      <SectionTitle aside={<Link href="/clients" className="text-xs text-violet">All clients</Link>}>Needs attention</SectionTitle>
      {view.attention.length ? (
        <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {view.attention.slice(0, 8).map(({ client, state, reason }) => (
            <li key={client.id}>
              <Link href={`/clients/${client.id}`} className="pressable flex min-h-12 items-start gap-3 px-4 py-2.5">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", state === "at_risk" ? "bg-rose" : "bg-amber")} aria-label={state === "at_risk" ? "At risk" : "Needs attention"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{client.name}</span>
                  {reason && <span className="block text-[11px] text-muted">{reason}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="glass rounded-2xl px-4 py-3 text-sm text-muted">All your clients look healthy.</p>
      )}

      {view.replyWaiting.length > 0 && (
        <>
          <SectionTitle aside="GoHighLevel times only">Waiting for our reply</SectionTitle>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {view.replyWaiting.slice(0, 6).map(({ client, days }) => (
              <li key={client.id}>
                <Link href={`/clients/${client.id}`} className="pressable flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
                  <span className="truncate text-sm font-semibold">{client.name}</span>
                  <span className={cn("shrink-0 text-xs", days >= 4 ? "font-semibold text-rose" : "text-amber")}>{days} day{days === 1 ? "" : "s"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {view.promises.length > 0 && (
        <>
          <SectionTitle>Promises to clients</SectionTitle>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {view.promises.map((a) => {
              const missed = promiseMissed(a, today);
              return (
                <li key={a.id} className="px-4 py-2.5">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="text-[11px] text-muted">
                    {a.client?.name} · <span className={missed ? "font-semibold text-rose" : "text-amber"}>{missed ? "missed" : "promised by"} {a.promisedOn}</span>
                    {a.ownerName ? ` · ${a.ownerName}` : " · no owner"}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <SectionTitle aside={<Link href="/work" className="text-xs text-violet">Work</Link>}>{linked ? "My follow-ups and issues" : "Follow-ups and issues"}</SectionTitle>
      <PriorityList items={view.priorities} staff={staff} canEdit={canEdit} limit={6} empty="Nothing due. Nice." />
    </>
  );
}
