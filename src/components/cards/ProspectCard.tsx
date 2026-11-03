import { ChevronRight } from "lucide-react";
import { cn, describeDue, formatUsd } from "@/lib/format";
import type { Prospect, ProspectStage } from "@/lib/types";
import { GradeBadge, Pill, type Tone } from "@/components/labels/labels";
import { GlassCard } from "./GlassCard";

export const stageInfo: Record<ProspectStage, { label: string; color: Tone }> = {
  new: { label: "New", color: "violet" },
  contacted: { label: "Contacted", color: "sky" },
  call_booked: { label: "Call booked", color: "teal" },
  proposal_sent: { label: "Proposal sent", color: "amber" },
  won: { label: "Won", color: "lime" },
  lost: { label: "Lost", color: "neutral" },
};

export function ProspectCard({ prospect: p, today }: { prospect: Prospect; today: string }) {
  const overdue = p.nextFollowUp !== undefined && p.nextFollowUp < today;
  const open = p.stage !== "won" && p.stage !== "lost";
  return (
    <GlassCard
      href={`/sales/${p.id}`}
      label={`Open prospect ${p.name}, grade ${p.grade.letter}`}
      padding="tight"
      className={cn("flex items-center gap-3", p.grade.letter === "A" && open && "border-amber/30")}
    >
      <GradeBadge grade={p.grade.letter} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{p.name}</p>
        <p className="truncate text-xs text-muted">
          {p.wants.join(" + ")} · est. {formatUsd(p.estMonthlyUsd.low)}–{formatUsd(p.estMonthlyUsd.high)}/mo
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Pill color={stageInfo[p.stage].color}>{stageInfo[p.stage].label}</Pill>
          {p.nextFollowUp && open && (
            <span className={cn("text-[11px]", overdue ? "font-semibold text-rose" : "text-faint")}>
              Follow up {describeDue(p.nextFollowUp, today)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-faint" />
    </GlassCard>
  );
}
