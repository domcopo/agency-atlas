import { ArrowRight, Bot, CircleAlert, Link2 } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { Insight } from "@/lib/types";
import { ConfidenceMeter, Pill } from "@/components/labels/labels";
import { GlassCard } from "./GlassCard";

const reviewPill = {
  unreviewed: { label: "Needs human review", color: "amber" },
  approved: { label: "Reviewed", color: "lime" },
  dismissed: { label: "Dismissed", color: "neutral" },
} as const;

export function InsightCard({ insight }: { insight: Insight }) {
  const review = reviewPill[insight.reviewStatus];
  return (
    <GlassCard className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {insight.generatedBy === "mock_ai" && (
          <Pill color="amber">
            <Bot aria-hidden className="size-3" />
            Mock AI — hand-written
          </Pill>
        )}
        <Pill color={review.color}>{review.label}</Pill>
      </div>

      <div>
        <h3 className="font-semibold leading-snug">{insight.title}</h3>
        <p className="mt-1 text-sm text-muted">{insight.observation}</p>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Evidence</p>
        <ul className="flex flex-wrap gap-1.5">
          {insight.evidence.map((e) => (
            <li key={e.recordId}>
              <Link
                href={`/${e.recordType === "lead" ? "leads" : e.recordType === "deal" ? "deals" : "buyers"}/${e.recordId}`}
                className="pressable inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-white/5 px-2.5 text-xs text-ink hover:border-violet/50"
              >
                <Link2 aria-hidden className="size-3 text-violet" />
                {e.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {insight.caveats.length > 0 && (
        <ul className="space-y-1 rounded-2xl bg-white/[0.03] p-3 text-xs text-muted">
          {insight.caveats.map((c) => (
            <li key={c} className="flex gap-1.5">
              <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-amber" />
              {c}
            </li>
          ))}
        </ul>
      )}

      <p className="flex gap-1.5 text-sm">
        <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0 text-teal" />
        <span>
          <span className="text-muted">Suggested next step (for a human): </span>
          {insight.suggestedNextStep}
        </span>
      </p>

      <div className="flex items-center justify-between border-t border-line pt-2.5">
        <ConfidenceMeter level={insight.confidence} />
        <span className="text-[11px] text-faint">{formatDate(insight.createdAt)}</span>
      </div>
    </GlassCard>
  );
}
