// "Clients won & lost": six months of wins and losses, plus lost / paused / churn.
// Moved from Sales to Clients (SALES_SIMPLIFY_PLAN, 2026-11-17): it's about clients, not leads.

import { GlassCard } from "@/components/cards/GlassCard";
import { WinLossChart } from "@/components/cards/WinLossChart";
import { Provenance } from "@/components/labels/labels";
import { Fold } from "@/components/shell/Fold";
import type { getWinLoss } from "@/lib/data-source";
import { formatUsdExact } from "@/lib/format";

function monthLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
}

export function WinLossSection({ winLoss, real }: { winLoss: Awaited<ReturnType<typeof getWinLoss>>; real: boolean }) {
  return (
    <Fold title="Clients won & lost" summary={`${winLoss.lostTotal} lost all-time · ${winLoss.lifetimeChurnPct}% lifetime churn`} badge={<Provenance kind={real ? "real" : "demo"} />} label="Clients won and lost">
      <GlassCard>
        <WinLossChart months={winLoss.months.map((m) => ({ ...m, label: monthLabel(m.month) }))} lostWithoutDate={winLoss.lostWithoutDate} hasRealData={real} />
      </GlassCard>
      <div className="mt-2.5 grid grid-cols-3 gap-2.5 text-center">
        <GlassCard padding="tight">
          <p className="font-display text-xl font-bold text-rose">{winLoss.lostTotal}</p>
          <p className="text-[10px] leading-tight text-muted">Lost all-time</p>
          <p className="text-[11px] font-semibold">{formatUsdExact(winLoss.lostTotalMrr)}/mo</p>
        </GlassCard>
        <GlassCard padding="tight">
          <p className="font-display text-xl font-bold text-amber">{winLoss.pausedCount}</p>
          <p className="text-[10px] leading-tight text-muted">Paused (at risk)</p>
          <p className="text-[11px] font-semibold">{formatUsdExact(winLoss.pausedMrr)}/mo</p>
        </GlassCard>
        <GlassCard padding="tight">
          <p className="font-display text-xl font-bold">{winLoss.lifetimeChurnPct}%</p>
          <p className="text-[10px] leading-tight text-muted">Lifetime churn</p>
          <p className="text-[11px] text-faint">lost ÷ ever signed</p>
        </GlassCard>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-faint">Lost = canceled or expired. Paused clients are shown separately because they may come back.</p>
    </Fold>
  );
}
