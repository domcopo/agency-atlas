import { ArrowRight, BadgeCheck, Layers, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GlassCard } from "@/components/cards/GlassCard";
import { BuyerInterestPill, DealStagePill } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getBuyer, getBuyers, getDispoDeals, getLead, getMissionControl } from "@/lib/data-source";
import { daysBetween, formatUsd } from "@/lib/format";
import type { Buyer, Deal, Lead } from "@/lib/types";

export const metadata: Metadata = { title: "Dispo" };

/** What we'd sell the contract for: contract price + the low end of our fee estimate. */
function askingFromBuyer(deal: Deal): number | null {
  if (deal.contractPrice.status !== "confirmed") return null;
  const fee = deal.assignmentFee;
  const add = fee.status === "confirmed" ? fee.amountUsd : fee.status === "estimated" ? fee.lowUsd : 0;
  return deal.contractPrice.amountUsd + add;
}

/** Buyers whose stated area, property type and price range fit this deal. A suggestion only. */
function matchingBuyers(deal: Deal, lead: Lead | undefined, buyers: Buyer[]): Buyer[] {
  const price = askingFromBuyer(deal);
  if (!lead || price === null) return [];
  const already = new Set(deal.buyerInterest.map((b) => b.buyerId));
  return buyers.filter(
    (b) =>
      !already.has(b.id) &&
      b.areas.includes(lead.property.city) &&
      (b.propertyTypes.includes(lead.property.type) || lead.property.condition === "Teardown") &&
      price >= b.buyBox.minUsd &&
      price <= b.buyBox.maxUsd &&
      b.reliability !== "D" &&
      // "Turnkey only" buyers skip anything that needs real work.
      !(b.tags.includes("Turnkey only") && (lead.property.condition === "Heavy rehab" || lead.property.condition === "Teardown")),
  );
}

export default function DispoPage() {
  const { today } = getMissionControl();
  const deals = getDispoDeals();
  const buyers = getBuyers();
  const verified = buyers.filter((b) => b.proofOfFunds.status === "verified").length;

  return (
    <>
      <PageHeader title="Dispositions" subtitle={`${deals.length} deals to sell to buyers`} />

      <div className="grid grid-cols-2 gap-3">
        <GlassCard padding="tight">
          <p className="text-[11px] text-muted">Offers in hand</p>
          <p className="font-display text-2xl font-bold">
            {deals.reduce((n, d) => n + d.buyerInterest.filter((b) => b.status === "offer").length, 0)}
          </p>
        </GlassCard>
        <GlassCard href="/buyers" label="Open Buyers Dex" padding="tight">
          <p className="flex items-center justify-between text-[11px] text-muted">
            Buyers Dex <Layers aria-hidden className="size-3.5 text-violet" />
          </p>
          <p className="font-display text-2xl font-bold">
            {buyers.length}
            <span className="ml-1.5 text-xs font-medium text-teal">{verified} with POF</span>
          </p>
        </GlassCard>
      </div>

      {deals.map((deal) => {
        const lead = getLead(deal.leadId);
        const matches = matchingBuyers(deal, lead, buyers);
        const price = askingFromBuyer(deal);
        const offers = deal.buyerInterest.filter((b) => b.offer !== undefined).map((b) => b.offer as number);
        const best = offers.length ? Math.max(...offers) : null;
        const daysSinceContract = daysBetween(deal.contractSignedAt, today);
        const daysToClose = daysBetween(today, deal.closingAt);

        return (
          <section key={deal.id} aria-labelledby={`h-${deal.id}`}>
            <SectionTitle aside={`${daysToClose} days to closing`}>
              <span id={`h-${deal.id}`}>{deal.title}</span>
            </SectionTitle>
            <GlassCard className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <DealStagePill stage={deal.stage} />
                <span className="text-xs text-muted">
                  {daysSinceContract} days since contract
                  {lead ? ` · ${lead.property.condition}` : ""}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-faint">Our price to buyers</p>
                  <p className="font-semibold">{price !== null ? `${formatUsd(price)}+` : "Not set"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-faint">Best offer</p>
                  <p className={best !== null ? "font-semibold text-lime" : "text-faint"}>
                    {best !== null ? formatUsd(best) : "None yet"}
                  </p>
                </div>
              </div>

              {deal.buyerInterest.length > 0 && (
                <ul className="divide-y divide-line rounded-2xl bg-white/[0.03]">
                  {deal.buyerInterest.map((bi) => (
                    <li key={bi.buyerId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <Link href={`/buyers/${bi.buyerId}`} className="truncate hover:text-violet">
                        {getBuyer(bi.buyerId)?.name.replace(" (fictional)", "") ?? "Unknown buyer"}
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        {bi.offer !== undefined && <span className="text-xs font-semibold">{formatUsd(bi.offer)}</span>}
                        <BuyerInterestPill status={bi.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {matches.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
                    <Megaphone aria-hidden className="size-3.5 text-amber" />
                    Buyers who fit, not contacted yet
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {matches.map((b) => (
                      <li key={b.id}>
                        <Link
                          href={`/buyers/${b.id}`}
                          className="pressable inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-white/5 px-2.5 text-xs hover:border-violet/50"
                        >
                          {b.proofOfFunds.status === "verified" && (
                            <BadgeCheck aria-label="Proof of funds verified" className="size-3 text-teal" />
                          )}
                          {b.name.replace(" (fictional)", "")}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Link href={`/deals/${deal.id}`} className="flex items-center gap-1 text-sm font-semibold text-violet">
                Open deal <ArrowRight aria-hidden className="size-4" />
              </Link>
            </GlassCard>
          </section>
        );
      })}

      <p className="mt-6 px-1 text-[11px] text-faint">
        This app never emails or texts buyers. Your team reaches out from its own phones and tools, then
        logs what happened. &ldquo;Buyers who fit&rdquo; is a simple match on area, property type and price
        range: a suggestion, not a guarantee.
      </p>
    </>
  );
}
