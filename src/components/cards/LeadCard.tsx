import { ChevronRight } from "lucide-react";
import { cn, describeDue } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { GradeBadge, LeadStagePill } from "@/components/labels/labels";
import { GlassCard } from "./GlassCard";

export function LeadCard({ lead, today }: { lead: Lead; today: string }) {
  const overdue = lead.nextFollowUp !== undefined && lead.nextFollowUp < today;
  return (
    <GlassCard
      href={`/leads/${lead.id}`}
      label={`Open lead ${lead.property.street}, grade ${lead.grade.letter}`}
      padding="tight"
      className={cn("flex items-center gap-3", lead.grade.letter === "A" && "border-amber/30")}
    >
      <GradeBadge grade={lead.grade.letter} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{lead.property.street}</p>
        <p className="truncate text-xs text-muted">
          {lead.sellerName} · {lead.motivations[0] ?? lead.source}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <LeadStagePill stage={lead.stage} />
          {lead.nextFollowUp && lead.stage !== "dead" && lead.stage !== "under_contract" && (
            <span className={cn("text-[11px]", overdue ? "font-semibold text-rose" : "text-faint")}>
              Follow up {describeDue(lead.nextFollowUp, today)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-faint" />
    </GlassCard>
  );
}
