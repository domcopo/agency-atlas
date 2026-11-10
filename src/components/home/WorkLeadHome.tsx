// Work lead Home: review queue, stuck items, team load, unassigned and overdue work.
// Same buttons and rules as Work orders (the database has the final say).
import Link from "next/link";
import { updateAction } from "@/app/actions";
import { PulseStrip } from "@/components/cards/PulseStrip";
import { WorkloadChips } from "@/components/cards/WorkloadChips";
import { ReviewButtons } from "@/components/cards/WorkOrderList";
import { SectionTitle } from "@/components/shell/PageHeader";
import { lateBy, type WorkLeadView } from "@/lib/home-layouts";
import { minutesLabel, type WorkloadRow } from "@/lib/ops";
import type { ClientAction } from "@/lib/types";

function Line({ a, today, children }: { a: ClientAction; today: string; children?: React.ReactNode }) {
  const late = lateBy(a.dueOn, today);
  return (
    <li className="px-4 py-2.5">
      <p className="text-sm font-semibold">{a.title}</p>
      <p className="text-[11px] text-muted">
        {a.client?.name ?? "No client"} · {a.ownerName ?? "No owner"}
        {late && <span className="font-semibold text-rose"> · {late}</span>}
        {a.status === "blocked" && <span className="text-rose"> · stuck: {a.blockedReason || "no reason given"}</span>}
        {a.status === "review" && a.submittedAt && <span className="text-violet"> · sent {a.submittedAt.slice(0, 10)}</span>}
      </p>
      {children}
    </li>
  );
}

export function WorkLeadHome({ view, workload, staff, today }: { view: WorkLeadView; workload: WorkloadRow[]; staff: { id: string; name: string }[]; today: string }) {
  return (
    <>
      <PulseStrip
        tiles={[
          { label: "Waiting for review", value: String(view.review.length), source: view.avgWaitMinutes === null ? "Work orders" : `Avg wait ${minutesLabel(view.avgWaitMinutes)}`, href: "/work/orders", tone: view.review.length ? "violet" : "plain" },
          { label: "Stuck", value: String(view.blocked.length), source: "Marked blocked", href: "/work/orders", tone: view.blocked.length ? "rose" : "plain" },
          { label: "Overdue", value: String(view.overdue.length), source: "Work orders + issues", href: "/work/orders", tone: view.overdue.length ? "rose" : "plain" },
          { label: "Unassigned", value: String(view.unassigned.length), source: "No owner yet", href: "/work/orders", tone: view.unassigned.length ? "amber" : "plain" },
        ]}
      />

      <SectionTitle aside={<Link href="/work/orders" className="text-xs text-violet">Work orders</Link>}>Review queue</SectionTitle>
      {view.review.length ? (
        <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {view.review.slice(0, 6).map((a) => (
            <Line key={a.id} a={a} today={today}>
              <div className="mt-1.5">
                <ReviewButtons a={a} />
              </div>
            </Line>
          ))}
        </ul>
      ) : (
        <p className="glass rounded-2xl px-4 py-3 text-sm text-muted">Nothing waiting for review.</p>
      )}

      {view.blocked.length > 0 && (
        <>
          <SectionTitle>Stuck</SectionTitle>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {view.blocked.map((a) => (
              <Line key={a.id} a={a} today={today} />
            ))}
          </ul>
        </>
      )}

      {workload.length > 0 && (
        <>
          <SectionTitle>Team load</SectionTitle>
          <WorkloadChips rows={workload} />
        </>
      )}

      {(view.unassigned.length > 0 || view.overdue.length > 0) && (
        <>
          <SectionTitle>Unassigned and overdue</SectionTitle>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {[...view.unassigned, ...view.overdue.filter((a) => a.ownerId)].slice(0, 10).map((a) => (
              <Line key={a.id} a={a} today={today}>
                <form key={`assign-${a.ownerId ?? ""}`} action={updateAction} className="mt-1.5 flex gap-1.5">
                  <input type="hidden" name="actionId" value={a.id} />
                  <input type="hidden" name="op" value="assign" />
                  <select name="ownerId" defaultValue={a.ownerId ?? ""} aria-label={`Who does "${a.title}"`} className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-white/5 px-2 text-xs text-ink">
                    <option value="">No owner</option>
                    {staff.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="pressable min-h-10 rounded-lg border border-line bg-white/5 px-3 text-xs font-semibold">
                    Assign
                  </button>
                </form>
              </Line>
            ))}
          </ul>
        </>
      )}

      <Link href="/work/orders" className="pressable glass mt-4 flex min-h-11 items-center justify-between rounded-2xl px-4 text-sm">
        <span className="font-semibold text-violet">Work orders</span>
        <span className="text-xs text-muted">Suggestions, quick add, everyone&apos;s list</span>
      </Link>
    </>
  );
}
