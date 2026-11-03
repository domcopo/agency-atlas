import { ChevronRight, Clock, UserRound } from "lucide-react";
import { cn, describeDue } from "@/lib/format";
import type { WorkOrder, WorkPriority, WorkStatus } from "@/lib/types";
import { Pill, type Tone } from "@/components/labels/labels";
import { GlassCard } from "./GlassCard";

export const priorityStyle: Record<WorkPriority, { label: string; color: Tone; bar: string }> = {
  urgent: { label: "Urgent", color: "rose", bar: "bg-rose" },
  high: { label: "High", color: "amber", bar: "bg-amber" },
  normal: { label: "Normal", color: "sky", bar: "bg-sky/60" },
  low: { label: "Low", color: "neutral", bar: "bg-white/20" },
};

export const statusStyle: Record<WorkStatus, { label: string; color: Tone }> = {
  todo: { label: "To do", color: "neutral" },
  in_progress: { label: "In progress", color: "violet" },
  waiting_on_client: { label: "Waiting on client", color: "amber" },
  review: { label: "Review", color: "teal" },
  done: { label: "Done", color: "lime" },
};

export function WorkOrderCard({ order: w, today, assigneeName }: { order: WorkOrder; today: string; assigneeName: string }) {
  const overdue = w.status !== "done" && w.due < today;
  const untouched = w.status !== "done" && w.lastTouched < today;
  const p = priorityStyle[w.priority];
  return (
    <GlassCard href={`/work/${w.id}`} label={`Open work order: ${w.title}`} padding="tight" className="relative flex items-center gap-3 pl-5">
      <span aria-hidden className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full", p.bar)} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-semibold", w.status === "done" && "text-faint line-through")}>{w.title}</p>
        <p className="truncate text-xs text-muted">
          {w.clientLabel} · {w.service}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Pill color={p.color}>{p.label}</Pill>
          <Pill color={statusStyle[w.status].color}>{statusStyle[w.status].label}</Pill>
          {w.status !== "done" && (
            <span className={cn("inline-flex items-center gap-1 text-[11px]", overdue ? "font-semibold text-rose" : "text-faint")}>
              <Clock aria-hidden className="size-3" />
              {describeDue(w.due, today)}
            </span>
          )}
          {untouched && <span className="text-[11px] font-semibold text-amber">Not touched today</span>}
        </div>
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-faint">
          <UserRound aria-hidden className="size-3" />
          {assigneeName}
          {w.requestedByClient && " · requested by client"}
        </p>
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-faint" />
    </GlassCard>
  );
}
