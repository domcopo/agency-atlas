import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/cards/GlassCard";
import { cn } from "@/lib/format";
import { money, type SpendingLine, type SpendingView } from "@/lib/spending";

const bar = { ok: "bg-teal", notice: "bg-amber", warning: "bg-rose", blocked: "bg-rose" } as const;

function Row({ l }: { l: SpendingLine }) {
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <Link href={l.href} className="font-semibold underline-offset-2 hover:underline">
          {l.label}
        </Link>
        <span className="shrink-0 text-xs text-muted">
          <span className="text-ink">{money(l.usedUsd)}</span> of {money(l.capUsd)}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={l.pct}
        aria-label={`${l.label}: ${l.pct}% of this month's cap used`}
      >
        <div className={cn("h-full rounded-full", bar[l.level])} style={{ width: `${Math.max(l.pct, l.usedUsd > 0 ? 2 : 0)}%` }} />
      </div>
      <p className="text-[11px] text-faint">{l.note}</p>
    </li>
  );
}

/** Every money cap in Atlas with this month's spending (Data Safety; owner and managers). */
export function SpendingCard({ view, owner }: { view: SpendingView; owner: boolean }) {
  return (
    <GlassCard className="space-y-4 text-sm">
      {view.warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-2xl border border-amber/40 bg-amber/8 p-3 text-xs">
          {view.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amber" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {view.aiLines.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">AI (Anthropic)</p>
          <ul className="space-y-3">
            {view.aiLines.map((l) => (
              <Row key={l.key} l={l} />
            ))}
          </ul>
          {view.helpers.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer select-none py-1 font-semibold">By helper this month</summary>
              <ul className="mt-1 space-y-1">
                {view.helpers.map((h) => (
                  <li key={h.feature} className="flex justify-between gap-2">
                    <span>
                      {h.label} · {h.requests} request{h.requests === 1 ? "" : "s"}
                    </span>
                    <span className="shrink-0">${h.usd.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {view.dataLines.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">DataForSEO lookups</p>
            <span className="text-xs text-muted">
              {money(view.dataUsedUsd)} of {money(view.dataCapUsd)} in all
            </span>
          </div>
          <ul className="space-y-3">
            {view.dataLines.map((l) => (
              <Row key={l.key} l={l} />
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-1 border-t border-line pt-3 text-xs text-muted">
        <li>• This month so far (New York time). Tap a name to {owner ? "change its cap" : "see it"}.</li>
        <li>• Second lock for AI: set the same monthly limit in your Anthropic Console.</li>
        <li>• Scout and SEO Watcher run in Claude Code with your DataForSEO login, so Atlas only records their estimates. Your prepaid DataForSEO balance is the real limit: keep it modest.</li>
      </ul>
    </GlassCard>
  );
}
