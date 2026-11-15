// Pipeline health (owner and managers): is each sales pipeline actually being worked?
// One row per sales pipeline, then (owner only) one row per salesperson.

import type { PersonRow, PipelineHealthRow } from "@/lib/sales";

function Stat({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] px-1 py-2 text-center">
      <p className={`font-display text-lg font-bold ${warn && n > 0 ? "text-amber" : ""}`}>{n}</p>
      <p className="text-[10px] leading-tight text-muted">{label}</p>
    </div>
  );
}

export function PipelineHealthCard({ rows, people }: { rows: PipelineHealthRow[]; people: PersonRow[] | null }) {
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.pipelineId} className="glass rounded-3xl p-4">
          <p className="mb-2 text-sm font-semibold">{r.name}</p>
          <div className="grid grid-cols-4 gap-1.5">
            <Stat n={r.open} label="Open" />
            <Stat n={r.newThisWeek} label="New this week" />
            <Stat n={r.notContacted} label="Not contacted" warn />
            <Stat n={r.stuck} label="Quiet 7+ days" warn />
          </div>
          <p className="mt-2 text-xs text-muted">
            Reach-outs: <span className="font-semibold text-ink">{r.touchesToday}</span> today · {r.touchesWeek} this week · Won {r.wonMonth} · Lost {r.lostMonth} this month
          </p>
        </div>
      ))}
      {people && people.length > 0 && (
        <div className="glass overflow-hidden rounded-3xl">
          <p className="px-4 pt-3 text-sm font-semibold">Salespeople today</p>
          <ul className="divide-y divide-line">
            {people.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className={p.weekday && p.touchesToday >= p.target ? "text-lime" : ""}>
                  {p.touchesToday}
                  {p.weekday ? ` / ${p.target}` : ""}
                </span>
                <span className="w-20 text-right text-[11px] text-muted">{p.leadsOwned === null ? "not linked" : `${p.leadsOwned} leads`}</span>
                <span className={`w-20 text-right text-[11px] ${p.overdueFollowUps ? "text-rose" : "text-faint"}`}>{p.overdueFollowUps} late</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="px-1 text-[11px] text-faint">
        From the reach-outs people log and the last lead refresh. &quot;Not contacted&quot; = no reach-out logged in Atlas yet.
      </p>
    </div>
  );
}
