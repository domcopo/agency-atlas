// Shared look for client dots on the Journey Line, the pipeline and the legend. Not a client
// module, so server components can use it too. Colour is never the only signal: StateBadge
// adds an icon, and every place that shows a dot also shows the words.

import { AlertTriangle, Clock, MessageCircle } from "lucide-react";
import { cn } from "@/lib/format";
import type { DotTiming } from "@/lib/journey-line";

/** One colour per stage (labels always sit under each segment). */
export const STAGE_COLORS = ["bg-sky", "bg-teal", "bg-violet", "bg-due-yellow", "bg-due-orange", "bg-lime"] as const;
export const STAGE_TEXT = ["text-sky", "text-teal", "text-violet", "text-due-yellow", "text-due-orange", "text-lime"] as const;

export const TIMING_WORDS: Record<DotTiming, string> = { overdue: "Overdue", today: "Due today", later: "On track" };

export function dotClasses(timing: DotTiming, reachedOut: boolean): string {
  return cn(
    "border-2",
    timing === "overdue" && "jl-pulse border-rose bg-[color-mix(in_srgb,var(--color-rose)_22%,var(--color-bg-raised))] text-rose",
    timing === "today" && "jl-pulse border-amber bg-[color-mix(in_srgb,var(--color-amber)_22%,var(--color-bg-raised))] text-amber",
    timing === "later" && "border-line bg-bg-raised text-muted",
    reachedOut && "jl-glow",
  );
}

/**
 * The small icon badges on a dot (the non-colour signal): ! for overdue, a clock for due
 * today, a speech bubble for "reached out" (a second badge, bottom right, when the touch is
 * also due or overdue).
 */
export function StateBadge({ timing, reachedOut, className }: { timing: DotTiming; reachedOut: boolean; className?: string }) {
  if (timing === "later" && !reachedOut) return null;
  const Icon = timing === "overdue" ? AlertTriangle : timing === "today" ? Clock : MessageCircle;
  const tone = timing === "overdue" ? "bg-rose" : timing === "today" ? "bg-amber" : "bg-violet";
  return (
    <>
      <span aria-hidden className={cn("flex size-3 items-center justify-center rounded-full text-bg", tone, className)}>
        <Icon className="size-2" strokeWidth={3} />
      </span>
      {reachedOut && timing !== "later" && (
        <span aria-hidden className="absolute -bottom-1 -right-1 flex size-3 items-center justify-center rounded-full bg-violet text-bg">
          <MessageCircle className="size-2" strokeWidth={3} />
        </span>
      )}
    </>
  );
}
