import { CalendarClock, ChevronRight, Flag } from "lucide-react";
import { daysBetween, formatShortDate } from "@/lib/format";
import type { Deal } from "@/lib/types";
import { DealStagePill, MoneyLabel, Pill } from "@/components/labels/labels";
import { GlassCard } from "./GlassCard";

export function DealCard({ deal, today }: { deal: Deal; today: string }) {
  const inspectionLeft = daysBetween(today, deal.inspectionEndsAt);
  const open = deal.stage === "under_contract" || deal.stage === "in_dispo";
  const offers = deal.buyerInterest.filter((b) => b.status === "offer").length;

  return (
    <GlassCard href={`/deals/${deal.id}`} label={`Open deal ${deal.title}`} className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{deal.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <DealStagePill stage={deal.stage} />
            {deal.needsReview && (
              <Pill color="amber">
                <Flag aria-hidden className="size-3" />
                Go over
              </Pill>
            )}
            {offers > 0 && open && <Pill color="lime">{offers} offer{offers === 1 ? "" : "s"}</Pill>}
          </div>
        </div>
        <ChevronRight aria-hidden className="mt-0.5 size-5 shrink-0 text-faint" />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="mb-0.5 text-faint">Contract</p>
          <MoneyLabel money={deal.contractPrice} />
        </div>
        <div>
          <p className="mb-0.5 text-faint">Our fee</p>
          <MoneyLabel money={deal.assignmentFee} />
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <CalendarClock aria-hidden className="size-3.5 shrink-0 text-violet" />
        {open && inspectionLeft >= 0 ? (
          <span className={inspectionLeft <= 2 ? "font-semibold text-rose" : undefined}>
            Inspection ends {inspectionLeft === 0 ? "today" : `in ${inspectionLeft} day${inspectionLeft === 1 ? "" : "s"}`}
          </span>
        ) : (
          <span>Closing {formatShortDate(deal.closingAt)}</span>
        )}
        {open && inspectionLeft >= 0 && <span className="text-faint">· closing {formatShortDate(deal.closingAt)}</span>}
      </p>
    </GlassCard>
  );
}
