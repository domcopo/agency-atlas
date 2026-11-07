// Clients who may cancel: one card each, with the problem, the recorded facts behind
// it (and where each came from), what to do, when it was first detected, and the
// score trend. Built by plain rules from your records (ops.ts riskAlerts), not by AI.

import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/format";
import type { RiskAlert } from "@/lib/ops";

const sevTone = {
  critical: { label: "Critical", pill: "border-rose/60 bg-rose/15 text-rose" },
  high: { label: "High", pill: "border-amber/50 bg-amber/12 text-amber" },
  medium: { label: "Watch", pill: "border-sky/40 bg-sky/10 text-sky" },
} as const;

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function ScoreTrend({ trend }: { trend: { change: number; since: string } | null }) {
  if (!trend || trend.change === 0) return null;
  const down = trend.change < 0;
  const Icon = down ? TrendingDown : TrendingUp;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", down ? "text-rose" : "text-lime")}>
      <Icon aria-hidden className="size-3" />
      {down ? "" : "+"}
      {trend.change} since {shortDay(trend.since)}
    </span>
  );
}

export function RiskAlerts({ alerts, limit = 5, historyReady }: { alerts: RiskAlert[]; limit?: number; historyReady: boolean }) {
  if (!alerts.length)
    return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No clients look likely to cancel right now.</p>;
  const top = alerts.slice(0, limit);
  const rest = alerts.slice(limit);
  const card = (a: RiskAlert) => (
    <li key={a.id} className="glass rounded-3xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-bold", sevTone[a.severity].pill)}>{sevTone[a.severity].label}</span>
        <Link href={a.href} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">
          {a.client.name}
        </Link>
        <span className="text-xs text-muted">{a.score}/100</span>
        <ScoreTrend trend={a.trend} />
      </div>
      <p className="mt-1.5 text-sm">{a.problem}</p>
      <p className="mt-1 text-xs text-muted">
        ${a.client.monthlyUsd.toLocaleString("en-US")}/mo · {a.client.ownerName ?? <span className="text-amber">no owner</span>} · detected {shortDay(a.detectedOn)}
      </p>
      <details className="mt-2">
        <summary className="pressable inline-flex min-h-9 cursor-pointer list-none items-center text-xs font-semibold text-violet">
          Why ({a.evidence.length} {a.evidence.length === 1 ? "fact" : "facts"}) · {a.confidence}
        </summary>
        <ul className="mt-1 space-y-1 text-xs">
          {a.evidence.map((e) => (
            <li key={e.label} className="flex justify-between gap-3">
              <span className="text-muted">
                {e.label}
                {e.source && <span className="block text-[10px] text-faint">{e.source}</span>}
              </span>
              <span className="shrink-0 font-semibold text-rose">{e.impact}</span>
            </li>
          ))}
        </ul>
      </details>
      <Link href={`${a.href}#next`} className="pressable mt-2 flex min-h-10 items-center justify-between rounded-xl border border-violet/40 bg-violet/10 px-3 text-xs font-semibold">
        <span>Do next: {a.action}</span>
        <ArrowRight aria-hidden className="size-3.5 shrink-0" />
      </Link>
    </li>
  );
  return (
    <>
      <ul className="space-y-2.5">{top.map(card)}</ul>
      {rest.length > 0 && (
        <details className="mt-2.5">
          <summary className="pressable glass flex min-h-11 cursor-pointer list-none items-center justify-center rounded-2xl text-sm font-semibold text-violet">
            Show all {alerts.length}
          </summary>
          <ul className="mt-2.5 space-y-2.5">{rest.map(card)}</ul>
        </details>
      )}
      <p className="mt-1.5 px-1 text-[11px] text-faint">
        Built from your records by fixed rules (no AI).{" "}
        {historyReady ? "Trends compare with the saved daily scores." : "Score trends start after the 0009 setup step."}
      </p>
    </>
  );
}
