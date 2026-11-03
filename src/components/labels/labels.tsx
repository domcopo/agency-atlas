// Small labels that make trust visible: where a number came from,
// how confident we are, and whether data is fake or live.

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cn, describeChange, formatMoney } from "@/lib/format";
import type { BuyerInterest, Confidence, DataMode, DealStage, LeadGrade, LeadStage, Metric, Money } from "@/lib/types";

const tone = {
  violet: "border-violet/30 bg-violet/12 text-violet",
  lime: "border-lime/30 bg-lime/10 text-lime",
  teal: "border-teal/30 bg-teal/10 text-teal",
  amber: "border-amber/30 bg-amber/10 text-amber",
  rose: "border-rose/30 bg-rose/10 text-rose",
  sky: "border-sky/30 bg-sky/10 text-sky",
  neutral: "border-line bg-white/5 text-muted",
} as const;

export type Tone = keyof typeof tone;

export function Pill({
  children,
  color = "neutral",
  className,
}: {
  children: ReactNode;
  color?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4",
        tone[color],
        className,
      )}
    >
      {children}
    </span>
  );
}

const moneyStyles: Record<Money["status"], { label: string; color: Tone }> = {
  confirmed: { label: "Confirmed", color: "lime" },
  estimated: { label: "Estimate", color: "amber" },
  unknown: { label: "Unknown", color: "neutral" },
};

/** Money is never shown without its trust label (and, when asked, its basis). */
export function MoneyLabel({ money, showBasis }: { money: Money; showBasis?: boolean }) {
  const style = moneyStyles[money.status];
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className={cn("font-semibold", money.status === "unknown" && "text-faint")}>
          {money.status === "unknown" ? "Not known" : formatMoney(money)}
        </span>
        <Pill color={style.color}>{style.label}</Pill>
      </span>
      {showBasis && money.status !== "unknown" && (
        <span className="text-[11px] text-faint">{money.basis}</span>
      )}
    </span>
  );
}

const gradeStyles: Record<LeadGrade, string> = {
  A: "from-amber to-[#ffe08a] text-bg shadow-[0_0_14px_-2px_var(--color-amber)]",
  B: "from-teal to-sky text-bg",
  C: "from-white/25 to-white/10 text-ink",
  D: "from-white/10 to-white/5 text-faint",
};

/** A–D grade chip. Grade A glows gold. */
export function GradeBadge({ grade, size = "md" }: { grade: LeadGrade; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-display font-extrabold",
        size === "lg" ? "size-14 text-2xl" : "size-9 text-base",
        gradeStyles[grade],
      )}
    >
      <span className="sr-only">Grade </span>
      {grade}
    </span>
  );
}

const leadStageStyles: Record<LeadStage, { label: string; color: Tone }> = {
  new: { label: "New", color: "violet" },
  contacted: { label: "Contacted", color: "sky" },
  appointment_set: { label: "Appointment set", color: "teal" },
  offer_made: { label: "Offer made", color: "amber" },
  under_contract: { label: "Under contract", color: "lime" },
  dead: { label: "Dead", color: "neutral" },
};

export function LeadStagePill({ stage }: { stage: LeadStage }) {
  const s = leadStageStyles[stage];
  return <Pill color={s.color}>{s.label}</Pill>;
}

export const dealStageStyles: Record<DealStage, { label: string; color: Tone }> = {
  under_contract: { label: "Under contract", color: "sky" },
  in_dispo: { label: "In dispo", color: "violet" },
  assigned: { label: "Assigned", color: "teal" },
  closed: { label: "Closed", color: "lime" },
  fell_through: { label: "Fell through", color: "rose" },
};

export function DealStagePill({ stage }: { stage: DealStage }) {
  const s = dealStageStyles[stage];
  return <Pill color={s.color}>{s.label}</Pill>;
}

const interestStyles: Record<BuyerInterest["status"], { label: string; color: Tone }> = {
  sent: { label: "Shared", color: "neutral" },
  walkthrough: { label: "Walkthrough", color: "sky" },
  offer: { label: "Offer", color: "lime" },
  passed: { label: "Passed", color: "rose" },
};

export function BuyerInterestPill({ status }: { status: BuyerInterest["status"] }) {
  const s = interestStyles[status];
  return <Pill color={s.color}>{s.label}</Pill>;
}

const confidenceLevels: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

export function ConfidenceMeter({ level }: { level: Confidence }) {
  const filled = confidenceLevels[level];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "w-1 rounded-sm",
              i === 1 ? "h-1.5" : i === 2 ? "h-2.5" : "h-3.5",
              i <= filled ? "bg-violet" : "bg-white/15",
            )}
          />
        ))}
      </span>
      <span>
        {level.charAt(0).toUpperCase() + level.slice(1)} confidence
      </span>
    </span>
  );
}

export function DataModeBadge({ mode }: { mode: DataMode }) {
  return mode === "mock" ? (
    <Pill color="amber">MOCK DATA</Pill>
  ) : (
    <Pill color="lime">LIVE · READ-ONLY</Pill>
  );
}

/** "▲ 12%" with green/red meaning good/bad news, not just up/down. */
export function DeltaPill({ metric }: { metric: Pick<Metric, "value" | "previous" | "unit" | "betterWhen"> }) {
  const { direction, isGood, text } = describeChange(metric);
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const color = isGood === null ? "text-muted" : isGood ? "text-lime" : "text-rose";
  const words =
    direction === "flat" ? "no change" : `${direction} ${text}, ${isGood ? "good" : "needs attention"}`;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", color)}>
      <Icon aria-hidden className="size-3.5" />
      <span aria-hidden>{direction === "flat" ? "0" : text}</span>
      <span className="sr-only">{words}</span>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-white/12 px-5 py-7 text-center">
      <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-white/5 text-violet">
        {icon}
      </div>
      <p className="font-semibold">{title}</p>
      <div className="mx-auto mt-1 max-w-xs text-sm text-muted">{children}</div>
    </div>
  );
}
