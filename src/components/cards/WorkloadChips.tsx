// Workload at a glance: each open work order or issue is a chip on that person's pile.
// Wider chip = more time; color = status; red ring = overdue. Tap a chip to jump to it
// in the list below. Server component: no data leaves the page, nothing is sent.

import { cn } from "@/lib/format";
import { WORKLOAD, type WorkChip, type WorkloadRow } from "@/lib/ops";

const chipColor: Record<string, string> = {
  open: "bg-sky/70",
  in_progress: "bg-teal/80",
  waiting: "bg-amber/60",
  blocked: "bg-rose/80",
  review: "bg-violet/80",
};
const chipWidth: Record<WorkChip["size"], string> = { s: "w-4", m: "w-7", l: "w-11", xl: "w-16" };
const statusWord: Record<string, string> = { open: "to do", in_progress: "in progress", waiting: "waiting on client", blocked: "blocked", review: "waiting for review" };
const levelTone: Record<WorkloadRow["level"], { text: string; bar: string; label: string }> = {
  free: { text: "text-lime", bar: "bg-lime/70", label: "Free" },
  light: { text: "text-teal", bar: "bg-teal/70", label: "Light" },
  busy: { text: "text-amber", bar: "bg-amber/80", label: "Busy" },
  overloaded: { text: "text-rose", bar: "bg-rose/80", label: "Overloaded" },
};

function hoursLabel(h: number): string {
  return h === 0 ? "nothing open" : `~${h % 1 ? h.toFixed(1) : h}h`;
}

export function WorkloadChips({ rows, linkable = true }: { rows: WorkloadRow[]; linkable?: boolean }) {
  if (!rows.length) return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No team members yet.</p>;
  return (
    <div className="glass rounded-3xl p-3">
      <ul className="space-y-3">
        {rows.map((r) => {
          const tone = r.ownerId ? levelTone[r.level] : { text: "text-amber", bar: "bg-amber/80", label: "Needs an owner" };
          const pct = Math.min(100, Math.round((r.hours / WORKLOAD.overloadedHours) * 100));
          return (
            <li key={r.ownerId ?? "none"}>
              <div className="flex items-baseline justify-between gap-2 px-1">
                <span className={cn("truncate text-sm font-semibold", r.ownerId ? "" : "text-amber")}>{r.ownerName}</span>
                <span className="shrink-0 text-[11px] text-muted">
                  {r.chips.length} open · {hoursLabel(r.hours)}
                  {r.overdue ? <span className="font-semibold text-rose"> · {r.overdue} overdue</span> : null} · <span className={cn("font-semibold", tone.text)}>{tone.label}</span>
                </span>
              </div>
              <div className="mt-1.5 flex min-h-7 flex-wrap items-end gap-1 px-1" role="list" aria-label={`${r.ownerName}'s open work`}>
                {r.chips.map((c, i) => {
                  const label = `${c.title}${c.client ? `, ${c.client}` : ""}: ${statusWord[c.status] ?? c.status}${c.overdue ? ", overdue" : ""}, ${c.estimated ? `about ${c.minutes} min` : "no estimate"}`;
                  const cls = cn(
                    "animate-chip-in block h-6 rounded-md shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]",
                    chipWidth[c.size],
                    chipColor[c.status] ?? "bg-white/30",
                    c.overdue && "ring-2 ring-rose ring-offset-1 ring-offset-bg",
                    !c.estimated && "opacity-70 [background-image:repeating-linear-gradient(135deg,transparent_0_3px,rgb(0_0_0/0.25)_3px_5px)]",
                  );
                  const style = { animationDelay: `${Math.min(i, 20) * 35}ms` };
                  return linkable ? (
                    <a key={c.id} role="listitem" href={`#wo-${c.id}`} title={label} aria-label={label} className={cn(cls, "pressable")} style={style} />
                  ) : (
                    <span key={c.id} role="listitem" title={label} aria-label={label} className={cls} style={style} />
                  );
                })}
                {!r.chips.length && <span className="text-[11px] text-faint">Can take new work</span>}
              </div>
              <div className="mx-1 mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-faint">
        <span><span className="mr-1 inline-block size-2 rounded-sm bg-sky/70" />to do</span>
        <span><span className="mr-1 inline-block size-2 rounded-sm bg-teal/80" />in progress</span>
        <span><span className="mr-1 inline-block size-2 rounded-sm bg-amber/60" />waiting</span>
        <span><span className="mr-1 inline-block size-2 rounded-sm bg-rose/80" />blocked</span>
        <span><span className="mr-1 inline-block size-2 rounded-sm bg-violet/80" />review</span>
        <span>red ring = overdue · striped = no estimate (counted as 1h) · wider = longer · bar fills at {WORKLOAD.overloadedHours}h</span>
      </p>
    </div>
  );
}
