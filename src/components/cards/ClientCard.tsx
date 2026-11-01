import { ChevronRight } from "lucide-react";
import { formatValue } from "@/lib/format";
import type { Client } from "@/lib/types";
import { HealthRing, healthLabel } from "@/components/labels/charts";
import { DeltaPill, Pill } from "@/components/labels/labels";
import { GlassCard } from "./GlassCard";

const statusColor = { thriving: "lime", steady: "sky", at_risk: "rose" } as const;

export function ClientCard({ client }: { client: Client }) {
  const headline = client.metrics[0];
  return (
    <GlassCard href={`/clients/${client.id}`} label={`Open ${client.name}`} className="flex items-center gap-4">
      <HealthRing score={client.health.score} status={client.health.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{client.name}</p>
        <p className="text-xs text-muted">{client.industry}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill color={statusColor[client.health.status]}>{healthLabel[client.health.status]}</Pill>
          {headline && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              {headline.label} {formatValue(headline.value, headline.unit)}
              <DeltaPill metric={headline} />
            </span>
          )}
        </div>
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-faint" />
    </GlassCard>
  );
}
