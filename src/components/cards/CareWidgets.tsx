// Client care at a glance: the small growth line and today's goal (card on Home, chip on Clients).

import Link from "next/link";
import { cn } from "@/lib/format";

/** A tiny line of active clients per month, with the 3-month change. Hidden with fewer than 2 points. */
export function GrowthLine({ points }: { points: { month: string; active: number }[] }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 32;
  const max = Math.max(1, ...points.map((p) => p.active));
  const min = Math.min(...points.map((p) => p.active));
  const span = Math.max(1, max - min);
  const xy = points.map((p, i) => [Math.round((i / (points.length - 1)) * w), Math.round(h - 3 - ((p.active - min) / span) * (h - 6))] as const);
  const last = points[points.length - 1]!;
  const back = points[Math.max(0, points.length - 4)]!;
  const change = last.active - back.active;
  const label = `Active clients over ${points.length} months: ${points[0]!.active} to ${last.active}. ${change >= 0 ? "Up" : "Down"} ${Math.abs(change)} in 3 months.`;
  return (
    <span className="flex items-center gap-2" title={label}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="shrink-0">
        <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="text-violet" points={xy.map(([x, y]) => `${x},${y}`).join(" ")} />
        <circle cx={xy[xy.length - 1]![0]} cy={xy[xy.length - 1]![1]} r="2.5" className="fill-violet" />
      </svg>
      <span className="hidden text-right leading-tight sm:block">
        <span className={cn("block text-xs font-semibold", change > 0 ? "text-lime" : change < 0 ? "text-rose" : "text-muted")}>
          {change > 0 ? "+" : ""}
          {change} in 3 mo
        </span>
        <span className="block text-[10px] text-faint">active clients</span>
      </span>
    </span>
  );
}

/** Today's goal for the signed-in person: points, real conversations, clients moved up. */
export function CareGoalCard({ points, goal, calls, moved, pct }: { points: number; goal: number; calls: number; moved: number; pct: number }) {
  return (
    <section className="glass rounded-3xl p-3.5" aria-labelledby="goal-h">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="goal-h" className="text-sm font-semibold">
          Today&apos;s goal
        </h2>
        <span className="text-[11px] text-faint">call answered 3 · text, email or voicemail 1</span>
      </div>
      <p className="mt-1 font-display text-2xl font-bold">
        {points} <span className="text-sm font-normal text-muted">of {goal} points</span>
      </p>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Today's goal">
        <div className={cn("h-2 rounded-full", pct >= 100 ? "bg-lime" : "bg-violet")} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {calls} call{calls === 1 ? "" : "s"} connected · {moved} client{moved === 1 ? "" : "s"} moved up a stage
      </p>
    </section>
  );
}

/** Today's goal as a small chip next to the page title (the card's numbers, smaller). */
export function CareGoalChip({ points, goal, calls, pct, href }: { points: number; goal: number; calls: number; pct: number; href?: string }) {
  const label = `Today's goal: ${points} of ${goal} points, ${calls} call${calls === 1 ? "" : "s"} connected`;
  const body = (
    <>
      <span className="relative size-4" aria-hidden>
        <svg viewBox="0 0 20 20" className="size-4 -rotate-90">
          <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" className="stroke-white/15" />
          <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 50.3} 50.3`} className={pct >= 100 ? "stroke-lime" : "stroke-violet"} />
        </svg>
      </span>
      <span>
        {points}/{goal} <span className="font-normal text-faint">pts today</span>
      </span>
    </>
  );
  const cls = "inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-white/[0.03] px-2.5 text-[11px] font-semibold";
  return href ? (
    <Link href={href} aria-label={`${label}. Set goals.`} title={label} className={cn(cls, "pressable hover:border-violet/50")}>
      {body}
    </Link>
  ) : (
    <span role="img" aria-label={label} title={label} className={cls}>
      {body}
    </span>
  );
}
