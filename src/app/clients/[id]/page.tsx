import { AlertTriangle, BellRing, CalendarDays, Clock, Layers, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/cards/GlassCard";
import { EmptyState, Pill, Provenance, StatusPill } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getRoster, getRosterClient, getRosterSource, getToday, tierOf } from "@/lib/data-source";
import { describeTenure, formatDate, formatUsdExact } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return getRoster().map((c) => ({ id: c.id }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: getRosterClient(id)?.name ?? "Client" };
}

const tierLabel = { high: "High tier ($500+)", mid: "Mid tier ($150–499)", low: "Low tier (under $150)" } as const;
const sourceLabel: Record<string, string> = {
  sheet: "Full client sheet",
  pdf: "Top + recent clients PDF",
  demo: "Demo list",
};

export default async function ClientPage({ params }: Props) {
  const { id } = await params;
  const c = getRosterClient(id);
  if (!c) notFound();
  const today = getToday();
  const real = getRosterSource() === "private_file";

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={c.status === "active" ? tierLabel[tierOf(c.monthlyUsd)] : undefined}
        backHref="/clients"
        backLabel="Clients"
        action={<StatusPill status={c.status} />}
      />

      {c.check && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-amber/35 bg-amber/8 p-3.5 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-amber" />
          <p>
            <span className="font-semibold">Needs checking.</span> <span className="text-muted">{c.check}</span>
          </p>
        </div>
      )}

      {c.followUp && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-amber/35 bg-amber/8 p-3.5 text-sm">
          <BellRing aria-hidden className="mt-0.5 size-5 shrink-0 text-amber" />
          <p>
            <span className="font-semibold">Follow up.</span> <span className="text-muted">{c.followUp}</span>
          </p>
        </div>
      )}

      <GlassCard className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted">Monthly</p>
          <p className="font-display text-2xl font-bold">{formatUsdExact(c.monthlyUsd)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-xs text-muted">
            <Clock aria-hidden className="size-3" /> With you
          </p>
          <p className="font-display text-2xl font-bold">{describeTenure(c.startDate, today)}</p>
        </div>
        <div className="col-span-2 flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays aria-hidden className="size-4" /> Started {formatDate(c.startDate)}
        </div>
      </GlassCard>

      <SectionTitle>Services</SectionTitle>
      <GlassCard className="flex flex-wrap items-center gap-2 text-sm">
        {c.services.length > 0 ? (
          c.services.map((s) => (
            <Pill key={s} color="violet">
              {s}
            </Pill>
          ))
        ) : (
          <span className="text-muted">Not set yet. Tell Claude which services (SEO, Ads, Website) this client buys.</span>
        )}
      </GlassCard>

      <SectionTitle aside="From GoHighLevel, Phase 3">Results &amp; work orders</SectionTitle>
      <EmptyState icon={<ListChecks className="size-5" />} title="Not connected yet">
        Leads, appointments and this client&apos;s work orders will appear here once GoHighLevel is connected
        read-only. Nothing is made up in the meantime.
      </EmptyState>

      <SectionTitle>Where this record came from</SectionTitle>
      <GlassCard className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-muted">
            <Layers aria-hidden className="size-4" /> Listed in
          </span>
          <span className="text-right">{c.listedIn.map((s) => sourceLabel[s] ?? s).join(" + ") || "Unknown"}</span>
        </div>
        <div className="flex justify-end">
          <Provenance kind={real ? "real" : "demo"} />
        </div>
      </GlassCard>
    </>
  );
}
