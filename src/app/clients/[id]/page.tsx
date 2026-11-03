import { AlertTriangle, BellRing, CalendarDays, Clock, Layers, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/cards/CopyButton";
import { GlassCard } from "@/components/cards/GlassCard";
import { ScoreRing } from "@/components/labels/charts";
import { EmptyState, Pill, Provenance, StatusPill, healthStyle } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getClientHealth, getRoster, getRosterClient, getRosterSource, getToday, getWinBackList, tierOf } from "@/lib/data-source";
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
  const health = getClientHealth(c);
  const winBack = getWinBackList().find((w) => w.client.id === c.id);
  const ci = health?.checkIn;

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

      {health && ci && (
        <>
          <SectionTitle>Health &amp; check-ins</SectionTitle>
          <GlassCard className="space-y-3">
            <div className="flex items-center gap-4">
              <ScoreRing score={health.score} color={healthStyle[health.level].ring} label={`Health ${health.score} out of 100`} size={64} />
              <div>
                <p className={`text-lg font-bold ${healthStyle[health.level].text}`}>{healthStyle[health.level].label}</p>
                <p className="text-xs text-muted">
                  {ci.state === "never_logged"
                    ? `No check-in logged · check in every ${ci.cadenceDays} days`
                    : `Last check-in ${formatDate(ci.last!)} · next ${ci.state === "overdue" ? "was due" : "due"} ${formatDate(ci.due!)}`}
                </p>
              </div>
            </div>
            <ul className="space-y-1.5 border-t border-line pt-3 text-xs">
              {health.factors.map((f) => (
                <li key={f.label} className="flex justify-between gap-3">
                  <span className="text-muted">{f.label}</span>
                  <span className={f.impact < 0 ? "shrink-0 font-semibold text-rose" : "shrink-0 text-faint"}>
                    {f.impact < 0 ? f.impact : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-faint">Starts at 100. Each risk takes points off. 75+ healthy, 50–74 watch, under 50 at risk.</p>
          </GlassCard>
        </>
      )}

      {winBack && (
        <>
          <SectionTitle>Win-back message</SectionTitle>
          <GlassCard className="space-y-3">
            <p className="text-sm text-muted">{winBack.script}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-faint">Copy, edit, and send it yourself. The app never sends.</span>
              <CopyButton text={winBack.script} label="Copy win-back message" />
            </div>
          </GlassCard>
        </>
      )}

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
