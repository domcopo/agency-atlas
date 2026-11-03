import { formatDexNumber, initials } from "@/lib/format";
import type { Business, Industry } from "@/lib/types";
import { ConfidenceMeter, Pill, RevenueLabel } from "@/components/labels/labels";
import { GlassCard } from "./GlassCard";

/** Each industry gets its own card color, like card "types" in a collection. */
export const industryGradient: Record<Industry, string> = {
  Dental: "from-sky/70 to-violet/60",
  "Home services": "from-amber/70 to-rose/50",
  "Events & food": "from-rose/70 to-violet/50",
  Fitness: "from-lime/70 to-teal/50",
  Legal: "from-violet/80 to-sky/40",
  Restaurant: "from-rose/60 to-amber/50",
  Automotive: "from-sky/60 to-teal/50",
  Education: "from-teal/70 to-lime/40",
  Energy: "from-lime/60 to-amber/60",
};

export function Monogram({ business, size = "md" }: { business: Business; size?: "md" | "lg" }) {
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-display font-extrabold text-bg shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] ${industryGradient[business.industry]} ${size === "lg" ? "size-20 text-2xl" : "size-12 text-base"}`}
    >
      {initials(business.name)}
    </div>
  );
}

/** Highest confidence among a business's signals, for the card summary. */
function topConfidence(b: Business) {
  const order = { high: 3, medium: 2, low: 1 } as const;
  return b.signals.reduce<"high" | "medium" | "low">(
    (best, s) => (order[s.confidence] > order[best] ? s.confidence : best),
    "low",
  );
}

export function DexCard({ business }: { business: Business }) {
  return (
    <GlassCard
      href={`/growth/dex/${business.id}`}
      label={`Open ${business.name}, Dex ${formatDexNumber(business.dexNumber)}`}
      padding="tight"
      className="flex h-full flex-col gap-3"
    >
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-16 rounded-t-3xl bg-gradient-to-br opacity-25 ${industryGradient[business.industry]}`}
      />
      <div className="relative flex items-start justify-between">
        <Monogram business={business} />
        <span className="font-mono text-[11px] font-semibold text-muted">
          {formatDexNumber(business.dexNumber)}
        </span>
      </div>
      <div className="relative">
        <p className="font-semibold leading-snug">{business.name}</p>
        <p className="mt-0.5 text-xs text-muted">{business.industry}</p>
      </div>
      <div className="relative mt-auto space-y-2 text-xs">
        <RevenueLabel revenue={business.revenue} compact />
        <div className="flex flex-wrap items-center gap-1.5">
          {business.isClient && <Pill color="violet">Sample client</Pill>}
          <ConfidenceMeter level={topConfidence(business)} />
        </div>
      </div>
    </GlassCard>
  );
}
