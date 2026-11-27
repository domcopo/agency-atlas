// Work hub Team view (Phase 4, docs/WORK_HUB_PLAN.md): for each person, open hours due in
// the next 7 days against weekly capacity, as a green / amber / red bar, plus overdue items.
// Clicking a person shows their list. The math is teamLoad() in src/lib/work-hub.ts (tested).
// The founder isn't counted as available unless "Include founder" is on.

import Link from "next/link";
import { cn } from "@/lib/format";
import { TEAM_LOAD_RULES, type TeamLoadRow } from "@/lib/work-hub";

const BAR: Record<TeamLoadRow["tone"], string> = { green: "bg-lime", amber: "bg-amber", red: "bg-rose" };
const WORD: Record<TeamLoadRow["tone"], string> = { green: "Has room", amber: "Nearly full", red: "Over capacity" };
const hours = (m: number) => `${Math.round((m / 60) * 10) / 10} h`;

function Bar({ percent, tone, muted }: { percent: number; tone: TeamLoadRow["tone"]; muted?: boolean }) {
  return (
    <div className="relative h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
      <div className={cn("h-full rounded-full", muted ? "bg-white/25" : BAR[tone])} style={{ width: `${Math.min(100, Math.max(percent, percent > 0 ? 2 : 0))}%` }} />
      <div className="absolute inset-y-0 w-px bg-white/30" style={{ left: `${TEAM_LOAD_RULES.amber}%` }} />
    </div>
  );
}

export function TeamView({
  rows,
  totals,
  personHref,
  unassignedHref,
  founderToggleHref,
  includeFounder,
  hasFounder,
}: {
  rows: TeamLoadRow[];
  totals: { weekMinutes: number; capacityMinutes: number; percent: number; tone: TeamLoadRow["tone"]; unassignedMinutes: number };
  personHref: (staffId: string) => string;
  unassignedHref: string;
  founderToggleHref: string;
  includeFounder: boolean;
  hasFounder: boolean;
}) {
  if (!rows.length) return <p className="glass rounded-2xl px-4 py-3 text-sm text-muted">No team members yet.</p>;
  return (
    <div className="space-y-3">
      <section aria-label="Team this week" className="glass flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-4 py-3">
        <div className="min-w-56 flex-1">
          <p className="text-sm">
            <span className="font-semibold">Team this week: </span>
            {hours(totals.weekMinutes)} of {hours(totals.capacityMinutes)} available
            <span className={cn("ml-2 font-semibold", totals.tone === "red" ? "text-rose" : totals.tone === "amber" ? "text-amber" : "text-lime")}>{totals.percent}%</span>
          </p>
          <div className="mt-2">
            <Bar percent={totals.percent} tone={totals.tone} />
          </div>
        </div>
        {totals.unassignedMinutes > 0 && (
          <Link href={unassignedHref} className="pressable inline-flex min-h-10 items-center rounded-xl border border-amber/40 px-3 text-sm font-semibold text-amber hover:bg-amber/10">
            {hours(totals.unassignedMinutes)} due this week with no one assigned
          </Link>
        )}
        {hasFounder && (
          <Link href={founderToggleHref} scroll={false} aria-pressed={includeFounder} className="pressable inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white/5 px-3 text-sm font-semibold hover:bg-white/[0.08]">
            <span className={cn("flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", includeFounder ? "bg-violet-deep" : "bg-white/15")} aria-hidden>
              <span className={cn("size-4 rounded-full bg-white transition-transform", includeFounder && "translate-x-4")} />
            </span>
            Include founder
          </Link>
        )}
      </section>

      <ul className="glass divide-y divide-line overflow-hidden rounded-2xl">
        {rows.map((r) => (
          <li key={r.staffId}>
            <Link href={personHref(r.staffId)} className={cn("pressable grid gap-x-4 gap-y-2 px-4 py-3 hover:bg-white/[0.04] sm:grid-cols-[12rem_minmax(0,1fr)_12rem] sm:items-center", !r.counted && "opacity-60")}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{r.name}</span>
                <span className="block text-xs text-muted">{r.counted ? WORD[r.tone] : "Not counted as available"}</span>
              </span>
              <span className="min-w-0">
                <Bar percent={r.percent} tone={r.tone} muted={!r.counted} />
                <span className="mt-1 block text-xs text-muted">
                  <span className="font-semibold text-ink">{hours(r.weekMinutes)}</span> of {hours(r.capacityMinutes)} this week · {r.percent}%
                  {r.openMinutes > r.weekMinutes && ` · ${hours(r.openMinutes - r.weekMinutes)} later or no date`}
                </span>
              </span>
              <span className="flex flex-wrap gap-x-3 text-xs sm:justify-end">
                <span className="text-muted">{r.openItems} open</span>
                {r.overdue > 0 && <span className="font-semibold text-rose">{r.overdue} overdue</span>}
                {r.withoutEstimate > 0 && <span className="text-muted">{r.withoutEstimate} without estimate</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-1 text-xs text-muted">
        This week = open work due in the next 7 days, overdue included. Items without an estimate count as 1 h. Waiting for review doesn&apos;t count. Everyone has the same 25 h a week for now. Tap a person to see their list.
      </p>
    </div>
  );
}
