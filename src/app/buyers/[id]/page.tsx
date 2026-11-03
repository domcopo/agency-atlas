import { BadgeCheck, Eye, Mail, Phone, ShieldQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyerMonogram } from "@/components/cards/BuyerCard";
import { GlassCard } from "@/components/cards/GlassCard";
import { BuyerInterestPill, ConfidenceMeter, Pill } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getBuyer, getBuyers, getDeals } from "@/lib/data-source";
import { formatDate, formatDexNumber, formatUsd } from "@/lib/format";

export const dynamicParams = false;

export function generateStaticParams() {
  return getBuyers().map((b) => ({ id: b.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getBuyer(id)?.name ?? "Buyer" };
}

const reliabilityColor = { A: "lime", B: "sky", C: "amber", D: "rose" } as const;

export default async function BuyerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const buyer = getBuyer(id);
  if (!buyer) notFound();
  const activity = getDeals().flatMap((d) =>
    d.buyerInterest.filter((bi) => bi.buyerId === buyer.id).map((bi) => ({ deal: d, bi })),
  );

  return (
    <>
      <PageHeader title={buyer.name} subtitle={buyer.strategy} backHref="/buyers" backLabel="Buyers Dex" />

      <GlassCard className="flex items-center gap-4">
        <BuyerMonogram buyer={buyer} size="lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-mono text-xs text-muted">Dex {formatDexNumber(buyer.dexNumber)}</p>
          <div className="flex flex-wrap gap-1.5">
            <Pill color={reliabilityColor[buyer.reliability]}>Reliability {buyer.reliability}</Pill>
            {buyer.proofOfFunds.status === "verified" ? (
              <Pill color="teal">
                <BadgeCheck aria-hidden className="size-3" />
                POF verified
              </Pill>
            ) : (
              <Pill color="amber">
                <ShieldQuestion aria-hidden className="size-3" />
                No POF yet
              </Pill>
            )}
          </div>
          <p className="text-xs text-muted">{buyer.dealsClosedWithUs} deals closed with us</p>
        </div>
      </GlassCard>

      <SectionTitle>Buy box</SectionTitle>
      <GlassCard>
        <dl className="divide-y divide-line text-sm">
          <div className="flex justify-between gap-3 py-2.5">
            <dt className="text-muted">Price range</dt>
            <dd>
              {formatUsd(buyer.buyBox.minUsd)}–{formatUsd(buyer.buyBox.maxUsd)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-2.5">
            <dt className="text-muted">Areas</dt>
            <dd className="text-right">{buyer.areas.join(", ")}</dd>
          </div>
          <div className="flex justify-between gap-3 py-2.5">
            <dt className="text-muted">Property types</dt>
            <dd className="text-right">{buyer.propertyTypes.join(", ")}</dd>
          </div>
          <div className="flex justify-between gap-3 py-2.5">
            <dt className="text-muted">Typical close</dt>
            <dd>{buyer.closesInDays} days</dd>
          </div>
          {buyer.proofOfFunds.checkedAt && (
            <div className="flex justify-between gap-3 py-2.5">
              <dt className="text-muted">Proof of funds checked</dt>
              <dd>{formatDate(buyer.proofOfFunds.checkedAt)}</dd>
            </div>
          )}
          {buyer.lastPurchaseAt && (
            <div className="flex justify-between gap-3 py-2.5">
              <dt className="text-muted">Last purchase</dt>
              <dd>{formatDate(buyer.lastPurchaseAt)}</dd>
            </div>
          )}
        </dl>
        <p className="mt-2 text-[11px] text-faint">
          The buy box is what the buyer says they want, not verified. Proof-of-funds files are never stored in this app.
        </p>
      </GlassCard>

      <SectionTitle>Contact</SectionTitle>
      <GlassCard className="space-y-1.5 text-sm">
        <p className="font-medium">{buyer.contactName}</p>
        <p className="flex items-center gap-1.5 text-muted">
          <Phone aria-hidden className="size-3.5" />
          {buyer.phone}
        </p>
        <p className="flex items-center gap-1.5 break-all text-muted">
          <Mail aria-hidden className="size-3.5 shrink-0" />
          {buyer.email}
        </p>
      </GlassCard>

      <SectionTitle>What we&apos;ve seen</SectionTitle>
      <div className="space-y-2.5">
        {buyer.observations.map((o) => (
          <GlassCard key={o.id} padding="tight" className="flex gap-2.5">
            <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-teal" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{o.text}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <ConfidenceMeter level={o.confidence} />
                <span className="text-[11px] text-faint">{formatDate(o.observedAt)}</span>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <SectionTitle>Activity on our deals</SectionTitle>
      {activity.length > 0 ? (
        <GlassCard padding="none">
          <ul className="divide-y divide-line">
            {activity.map(({ deal, bi }) => (
              <li key={deal.id}>
                <Link href={`/deals/${deal.id}`} className="pressable flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="truncate">{deal.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {bi.offer !== undefined && <span className="text-xs font-semibold">{formatUsd(bi.offer)}</span>}
                    <BuyerInterestPill status={bi.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : (
        <p className="px-1 text-sm text-faint">No activity on current deals.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {buyer.tags.map((t) => (
          <Pill key={t}>{t}</Pill>
        ))}
      </div>
    </>
  );
}
