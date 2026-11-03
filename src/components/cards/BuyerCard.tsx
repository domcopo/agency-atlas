import { BadgeCheck } from "lucide-react";
import { formatDexNumber, formatUsd, initials } from "@/lib/format";
import type { Buyer, BuyerStrategy } from "@/lib/types";
import { Pill } from "@/components/labels/labels";
import { GlassCard } from "./GlassCard";

/** Each buyer strategy gets its own card color, like card "types" in a collection. */
export const strategyGradient: Record<BuyerStrategy, string> = {
  "Fix & flip": "from-amber/70 to-rose/50",
  Rental: "from-sky/70 to-violet/60",
  BRRRR: "from-teal/70 to-sky/50",
  "New build": "from-lime/60 to-teal/50",
  Wholetail: "from-violet/80 to-rose/40",
};

export function BuyerMonogram({ buyer, size = "md" }: { buyer: Buyer; size?: "md" | "lg" }) {
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-display font-extrabold text-bg shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] ${strategyGradient[buyer.strategy]} ${size === "lg" ? "size-20 text-2xl" : "size-12 text-base"}`}
    >
      {initials(buyer.name.replace(" (fictional)", ""))}
    </div>
  );
}

const reliabilityColor = { A: "lime", B: "sky", C: "amber", D: "rose" } as const;

export function BuyerCard({ buyer }: { buyer: Buyer }) {
  return (
    <GlassCard
      href={`/buyers/${buyer.id}`}
      label={`Open ${buyer.name}, Dex ${formatDexNumber(buyer.dexNumber)}`}
      padding="tight"
      className="flex h-full flex-col gap-3"
    >
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-16 rounded-t-3xl bg-gradient-to-br opacity-25 ${strategyGradient[buyer.strategy]}`}
      />
      <div className="relative flex items-start justify-between">
        <BuyerMonogram buyer={buyer} />
        <span className="font-mono text-[11px] font-semibold text-muted">{formatDexNumber(buyer.dexNumber)}</span>
      </div>
      <div className="relative">
        <p className="font-semibold leading-snug">{buyer.name.replace(" (fictional)", "")}</p>
        <p className="mt-0.5 text-xs text-muted">{buyer.strategy}</p>
      </div>
      <div className="relative mt-auto space-y-2 text-xs">
        <p className="text-muted">
          {formatUsd(buyer.buyBox.minUsd)}–{formatUsd(buyer.buyBox.maxUsd)} · {buyer.closesInDays}d close
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill color={reliabilityColor[buyer.reliability]}>Reliability {buyer.reliability}</Pill>
          {buyer.proofOfFunds.status === "verified" && (
            <Pill color="teal">
              <BadgeCheck aria-hidden className="size-3" />
              POF
            </Pill>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
