// "Today's plan" (the sales coach): the target and progress, then who to reach out to,
// each with a reason. Shown when the person opens the app; nothing is sent, no pop-ups.

import { LeadRow } from "@/components/sales/LeadRow";
import type { LeadTouch, PlanItem } from "@/lib/sales";

const GROUP_LABEL = { follow_up: "Follow-ups due", new: "New, not contacted", stuck: "Gone quiet" } as const;

export function TodayPlan({
  items,
  progress,
  lastByLead,
  today,
}: {
  items: PlanItem[];
  progress: { done: number; target: number; weekday: boolean; met: boolean };
  lastByLead: Map<string, LeadTouch>;
  today: string;
}) {
  const pct = progress.target ? Math.min(100, Math.round((progress.done / progress.target) * 100)) : 100;
  return (
    <>
      <div className="glass rounded-3xl p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">Reach-outs today</p>
          <p className="font-display text-xl font-bold">
            <span className={progress.met ? "text-lime" : ""}>{progress.done}</span>
            {progress.weekday && <span className="text-sm text-muted"> of {progress.target}</span>}
          </p>
        </div>
        {progress.weekday ? (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.target} aria-label="Reach-outs toward today's target">
            <div className={`h-full rounded-full ${progress.met ? "bg-lime" : "bg-violet"}`} style={{ width: `${pct}%` }} />
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">Weekend: no target today.</p>
        )}
        <p className="mt-2 text-[11px] text-faint">Counts the reach-outs you log in Atlas (New York time).</p>
      </div>

      {items.length === 0 ? (
        <p className="glass mt-3 rounded-3xl px-4 py-4 text-sm text-muted">Nothing urgent: no follow-ups due, no new leads waiting, nothing gone quiet. Nice.</p>
      ) : (
        <div className="glass mt-3 overflow-hidden rounded-3xl">
          <ol className="divide-y divide-line">
            {items.map((i, n) => (
              <li key={i.lead.ghlId}>
                {(n === 0 || items[n - 1]!.group !== i.group) && (
                  <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{GROUP_LABEL[i.group]}</p>
                )}
                <LeadRow
                  lead={i.lead}
                  last={lastByLead.get(i.lead.ghlId)}
                  hot={i.hot}
                  why={i.why}
                  today={today}
                  canTouch
                />
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
