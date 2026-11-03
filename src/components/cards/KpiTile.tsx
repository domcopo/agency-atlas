import { describeChange, formatValue } from "@/lib/format";
import type { AgencyKpi } from "@/lib/types";
import { Sparkline } from "@/components/labels/charts";
import { DeltaPill } from "@/components/labels/labels";
import { GlassCard } from "./GlassCard";

export function KpiTile({ kpi }: { kpi: AgencyKpi }) {
  const { isGood } = describeChange(kpi);
  const color =
    isGood === null ? "var(--color-sky)" : isGood ? "var(--color-lime)" : "var(--color-rose)";

  return (
    <GlassCard className="flex flex-col justify-between gap-3">
      <p className="text-xs font-medium text-muted">{kpi.label}</p>
      <div>
        <p className="font-display text-[26px] font-bold leading-none tracking-tight">
          {formatValue(kpi.value, kpi.unit)}
        </p>
        <div className="mt-2 flex items-end justify-between gap-2">
          <DeltaPill metric={kpi} />
          <Sparkline values={kpi.trend} color={color} width={64} height={24} />
        </div>
      </div>
    </GlassCard>
  );
}
