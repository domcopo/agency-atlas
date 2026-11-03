import { Flag } from "lucide-react";
import type { Metadata } from "next";
import { DealCard } from "@/components/cards/DealCard";
import { GlassCard } from "@/components/cards/GlassCard";
import { dealStageStyles } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getDeals, getMissionControl } from "@/lib/data-source";
import { cn, formatUsd } from "@/lib/format";
import type { DealStage } from "@/lib/types";

export const metadata: Metadata = { title: "Deals" };

const pipeline: DealStage[] = ["under_contract", "in_dispo", "assigned", "closed"];

export default function DealsPage() {
  const { today } = getMissionControl();
  const deals = getDeals();
  const toReview = deals.filter((d) => d.needsReview);
  const rest = deals.filter((d) => !d.needsReview);
  const active = deals.filter((d) => d.stage !== "fell_through" && d.stage !== "closed");

  // Add up expected fees as a range. Confirmed fees count at face value;
  // unknown fees are left out and called out, never guessed.
  let low = 0;
  let high = 0;
  let unknown = 0;
  for (const d of active) {
    const f = d.assignmentFee;
    if (f.status === "confirmed") {
      low += f.amountUsd;
      high += f.amountUsd;
    } else if (f.status === "estimated") {
      low += f.lowUsd;
      high += f.highUsd;
    } else unknown++;
  }

  return (
    <>
      <PageHeader title="Deals" subtitle={`${active.length} active · ${toReview.length} to go over`} />

      <GlassCard className="space-y-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {pipeline.map((stage) => {
            const n = deals.filter((d) => d.stage === stage).length;
            return (
              <div key={stage}>
                <p className={cn("font-display text-2xl font-bold", n === 0 && "text-faint")}>{n}</p>
                <p className="text-[10px] leading-tight text-muted">{dealStageStyles[stage].label}</p>
              </div>
            );
          })}
        </div>
        <div className="border-t border-line pt-3">
          <p className="text-xs text-muted">Expected fees on active deals</p>
          <p className="mt-0.5 font-display text-xl font-bold">
            {formatUsd(low)}–{formatUsd(high)}
          </p>
          <p className="mt-0.5 text-[11px] text-faint">
            Mostly estimates until an assignment is signed{unknown > 0 ? ` · ${unknown} deal with no estimate left out` : ""}.
          </p>
        </div>
      </GlassCard>

      <SectionTitle aside={<span className="inline-flex items-center gap-1"><Flag aria-hidden className="size-3" />Flagged</span>}>
        To go over
      </SectionTitle>
      <ul className="space-y-2.5">
        {toReview.map((d) => (
          <li key={d.id}>
            <DealCard deal={d} today={today} />
          </li>
        ))}
      </ul>

      <SectionTitle>Everything else</SectionTitle>
      <ul className="space-y-2.5">
        {rest.map((d) => (
          <li key={d.id}>
            <DealCard deal={d} today={today} />
          </li>
        ))}
      </ul>
    </>
  );
}
