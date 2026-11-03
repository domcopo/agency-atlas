import { AlertTriangle, ArrowRight, Flag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/cards/GlassCard";
import { BuyerInterestPill, DealStagePill, MoneyLabel } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getBuyer, getDeal, getDeals, getLead, getMissionControl } from "@/lib/data-source";
import { daysBetween, formatDate, formatUsd } from "@/lib/format";

export const dynamicParams = false;

export function generateStaticParams() {
  return getDeals().map((d) => ({ id: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getDeal(id)?.title ?? "Deal" };
}

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = getDeal(id);
  if (!deal) notFound();
  const { today } = getMissionControl();
  const lead = getLead(deal.leadId);
  const inspectionLeft = daysBetween(today, deal.inspectionEndsAt);

  const dates = [
    { label: "Contract signed", date: deal.contractSignedAt },
    { label: "Inspection period ends", date: deal.inspectionEndsAt },
    { label: "Closing", date: deal.closingAt },
  ];

  return (
    <>
      <PageHeader
        title={deal.title}
        subtitle={lead?.property.city}
        backHref="/deals"
        backLabel="Deals"
        action={<DealStagePill stage={deal.stage} />}
      />

      {deal.needsReview && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-amber/35 bg-amber/8 p-3.5 text-sm">
          <Flag aria-hidden className="mt-0.5 size-5 shrink-0 text-amber" />
          <p>
            <span className="font-semibold">Go over this deal.</span>{" "}
            <span className="text-muted">{deal.nextStep}</span>
          </p>
        </div>
      )}

      <SectionTitle aside="Every number shows its label">Numbers</SectionTitle>
      <GlassCard>
        <dl className="divide-y divide-line">
          {[
            { label: "Contract price", money: deal.contractPrice },
            { label: "After-repair value (ARV)", money: deal.arv },
            { label: "Repairs", money: deal.repairs },
            { label: "Our assignment fee", money: deal.assignmentFee },
          ].map((row) => (
            <div key={row.label} className="py-2.5">
              <dt className="mb-1 text-xs text-muted">{row.label}</dt>
              <dd className="text-sm">
                <MoneyLabel money={row.money} showBasis />
              </dd>
            </div>
          ))}
        </dl>
      </GlassCard>

      <SectionTitle>Key dates</SectionTitle>
      <GlassCard padding="none">
        <ol className="divide-y divide-line">
          {dates.map((d) => {
            const left = daysBetween(today, d.date);
            const soon = left >= 0 && left <= 2;
            return (
              <li key={d.label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className={left < 0 ? "text-faint" : undefined}>{d.label}</span>
                <span className={soon ? "font-semibold text-rose" : "text-muted"}>
                  {formatDate(d.date)}
                  {left >= 0 && ` · ${left === 0 ? "today" : `${left}d`}`}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
          Title: {deal.titleCompany}
          {inspectionLeft >= 0 && deal.stage !== "assigned" ? " · You can still cancel during inspection." : ""}
        </p>
      </GlassCard>

      {deal.risks.length > 0 && (
        <>
          <SectionTitle>Risks</SectionTitle>
          <ul className="space-y-1.5 rounded-2xl border border-rose/30 bg-rose/8 p-3.5 text-sm">
            {deal.risks.map((r) => (
              <li key={r} className="flex gap-2">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-rose" />
                {r}
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Next step</SectionTitle>
      <GlassCard className="flex gap-2 text-sm">
        <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0 text-teal" />
        {deal.nextStep}
      </GlassCard>

      <SectionTitle aside="Logged by the team">Buyer interest</SectionTitle>
      {deal.buyerInterest.length > 0 ? (
        <GlassCard padding="none">
          <ul className="divide-y divide-line">
            {deal.buyerInterest.map((bi) => {
              const buyer = getBuyer(bi.buyerId);
              return (
                <li key={bi.buyerId}>
                  <Link href={`/buyers/${bi.buyerId}`} className="pressable flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{buyer?.name ?? "Unknown buyer"}</span>
                      <span className="text-[11px] text-faint">{formatDate(bi.at)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {bi.offer !== undefined && <span className="text-sm font-semibold">{formatUsd(bi.offer)}</span>}
                      <BuyerInterestPill status={bi.status} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </GlassCard>
      ) : (
        <p className="px-1 text-sm text-faint">Not marketed to buyers yet.</p>
      )}

      {lead && (
        <p className="mt-6 text-center text-sm">
          <Link href={`/leads/${lead.id}`} className="text-violet hover:underline">
            Open seller lead: {lead.sellerName}
          </Link>
        </p>
      )}
    </>
  );
}
