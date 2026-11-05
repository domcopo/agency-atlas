import { Sparkles } from "lucide-react";
import { cn } from "@/lib/format";
import type { AiStatus } from "@/lib/types";

const tone = {
  ok: { bar: "bg-teal", text: "text-teal", label: "Within budget" },
  notice: { bar: "bg-amber", text: "text-amber", label: "Half the budget used" },
  warning: { bar: "bg-rose", text: "text-rose", label: "Close to the budget" },
  blocked: { bar: "bg-rose", text: "text-rose", label: "Budget used up: AI paused until the 1st" },
} as const;

const usd = (n: number) => `$${n.toFixed(n < 10 ? 2 : 0)}`;
const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** AI spend this month vs the budget. Compact = the small version for Home. */
export function AiMeter({ ai, compact = false }: { ai: AiStatus; compact?: boolean }) {
  const t = tone[ai.level];
  const bar = (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-white/10"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={ai.pct}
      aria-label={`AI budget used: ${ai.pct}%`}
    >
      <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${Math.max(ai.pct, ai.spentUsd > 0 ? 2 : 0)}%` }} />
    </div>
  );
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <Sparkles aria-hidden className={cn("size-3.5 shrink-0", t.text)} />
        <span className="shrink-0 text-muted">
          AI {usd(ai.spentUsd)} / {usd(ai.budgetUsd)}
        </span>
        {bar}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="font-display text-2xl font-bold">
            {usd(ai.spentUsd)} <span className="text-sm font-normal text-muted">of {usd(ai.budgetUsd)} this month</span>
          </p>
          <p className={cn("text-xs font-semibold", t.text)}>{t.label}</p>
        </div>
        <p className="shrink-0 text-right text-[11px] text-muted">
          {ai.requests} requests
          <br />
          {tokens(ai.inputTokens)} in · {tokens(ai.outputTokens)} out
        </p>
      </div>
      {bar}
      <p className="text-[11px] text-faint">Amber at 50%, red at 80%, and the app stops sending AI requests at 100%.</p>
    </div>
  );
}
