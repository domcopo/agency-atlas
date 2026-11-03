// Small labels that make trust visible: where a number came from,
// how confident we are, and whether data is fake or live.

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cn, describeChange, formatDate, formatUsd } from "@/lib/format";
import type { Confidence, DataMode, Grade, HealthLevel, Metric, Revenue, Source, SubscriptionStatus } from "@/lib/types";

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

const revenueStyles: Record<Revenue["status"], { label: string; color: Tone }> = {
  verified: { label: "Verified", color: "lime" },
  client_reported: { label: "Client-reported", color: "teal" },
  estimated: { label: "Estimate", color: "amber" },
  unknown: { label: "Unknown", color: "neutral" },
};

/** Revenue is never shown without its trust label. */
export function RevenueLabel({ revenue, compact }: { revenue: Revenue; compact?: boolean }) {
  const style = revenueStyles[revenue.status];
  const amount =
    revenue.status === "unknown"
      ? "Not known"
      : revenue.status === "estimated"
        ? `${formatUsd(revenue.lowUsd)}–${formatUsd(revenue.highUsd)}`
        : formatUsd(revenue.annualUsd);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={cn("font-semibold", revenue.status === "unknown" && "text-faint")}>
        {amount}
        {revenue.status !== "unknown" && !compact && (
          <span className="font-normal text-faint"> /yr</span>
        )}
      </span>
      <Pill color={style.color}>{style.label}</Pill>
    </span>
  );
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

const sourceKindLabel: Record<Source["kind"], string> = {
  client_provided: "Client-provided",
  public_web: "Public web",
  industry_report: "Industry report",
  internal_observation: "Agency data",
};

/** Sources are shown as plain text, never as clickable links, in Phase 1. */
export function SourceTag({ source }: { source: Source }) {
  return (
    <span className="text-[11px] text-faint">
      {sourceKindLabel[source.kind]} · {source.label} · {formatDate(source.retrievedAt)}
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

/** Says whether a section shows your REAL client list or SAMPLE data. */
export function Provenance({ kind, what = "your client list" }: { kind: "real" | "sample" | "demo"; what?: string }) {
  if (kind === "real") return <Pill color="teal">Real · {what}</Pill>;
  if (kind === "demo") return <Pill color="amber">Demo list</Pill>;
  return <Pill color="amber">Sample data</Pill>;
}

const gradeStyles: Record<Grade, string> = {
  A: "from-amber to-[#ffe08a] text-bg shadow-[0_0_14px_-2px_var(--color-amber)]",
  B: "from-teal to-sky text-bg",
  C: "from-white/25 to-white/10 text-ink",
  D: "from-white/10 to-white/5 text-faint",
};

/** A–D grade chip. Grade A glows gold. */
export function GradeBadge({ grade, size = "md" }: { grade: Grade; size?: "md" | "lg" }) {
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

const statusStyles: Record<SubscriptionStatus, { label: string; color: Tone }> = {
  active: { label: "Active", color: "lime" },
  paused: { label: "Paused", color: "amber" },
  canceled: { label: "Canceled", color: "rose" },
  incomplete_expired: { label: "Expired", color: "neutral" },
};

export function StatusPill({ status }: { status: SubscriptionStatus }) {
  const s = statusStyles[status];
  return <Pill color={s.color}>{s.label}</Pill>;
}

export const healthStyle: Record<HealthLevel, { label: string; dot: string; text: string; ring: string }> = {
  healthy: { label: "Healthy", dot: "bg-lime", text: "text-lime", ring: "#d4f57a" },
  watch: { label: "Watch", dot: "bg-amber", text: "text-amber", ring: "#fbbf4a" },
  at_risk: { label: "At risk", dot: "bg-rose", text: "text-rose", ring: "#ff7a93" },
};

/** Small colored dot + word for a client's health. */
export function HealthBadge({ level }: { level: HealthLevel }) {
  const h = healthStyle[level];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", h.text)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", h.dot)} />
      {h.label}
    </span>
  );
}
