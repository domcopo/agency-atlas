import { describeChange, formatValue } from "@/lib/format";
import type { AgencyKpi } from "@/lib/types";
import { Sparkline } from "@/components/labels/charts";
import { DeltaPill } from "@/components/labels/labels";
import { GlassCard } from "./GlassCard";

/** Compact number with its change vs last week and a tiny trend line. */
export function KpiTile({ kpi }: { kpi: AgencyKpi }) {
  const { isGood } = describeChange(kpi);
  const color =
    isGood === null ? "var(--color-sky)" : isGood ? "var(--color-lime)" : "var(--color-rose)";

  return (
    <GlassCard padding="tight" className="flex flex-col justify-between gap-2">
      <p className="text-[11px] font-medium leading-tight text-muted">{kpi.label}</p>
      <div>
        <p className="font-display text-xl font-bold leading-none tracking-tight">
          {formatValue(kpi.value, kpi.unit)}
        </p>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <DeltaPill metric={kpi} />
          <Sparkline values={kpi.trend} color={color} width={48} height={18} />
        </div>
      </div>
      {kpi.hint && <p className="text-[10px] leading-snug text-faint">{kpi.hint}</p>}
    </GlassCard>
  );
}
