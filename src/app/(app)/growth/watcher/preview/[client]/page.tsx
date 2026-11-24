// One client in the SEO Watcher sample (Phase A): visibility, keyword table,
// competitors, and whether next month's report would include an upsell section.

import { CheckCircle2, Circle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/cards/GlassCard";
import { Column, Columns } from "@/components/shell/Columns";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { Basis, SampleNotice, WATCH_BASE } from "@/components/watcher/Bits";
import { Change, LineChart, packText, pos, PositionChange, Sparkline, trendWord } from "@/components/watcher/Charts";
import { getMember, getWatchPreview, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { buildClient, MOVER_WEEKS } from "@/lib/watch/view";

export const metadata: Metadata = { title: "SEO Watcher client (sample)" };

const shortDate = (d: string | undefined) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";

export default async function WatcherClientPage({ params }: { params: Promise<{ client: string }> }) {
  if (usesDatabase() && !isLead((await getMember())?.role)) return <RoleNotice title="SEO Watcher" />;
  const { client: id } = await params;
  const preview = getWatchPreview();
  const view = buildClient(preview.data, id, preview.today);
  if (!view) notFound();
  const tw = trendWord(view.trend);

  return (
    <>
      <PageHeader title={view.client.name} subtitle={`${view.client.niche} · ${view.client.domain}`} backHref={WATCH_BASE} backLabel="Board" />
      <SampleNotice />

      <Columns layout="main">
        <Column>
          <GlassCard className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Visits from rankings / month</p>
                <p className="font-display text-3xl font-bold tabular-nums">{Math.round(view.visits.at(-1) ?? 0).toLocaleString("en-US")}</p>
              </div>
              <div className="text-right">
                <Change pct={view.changePct} />
                <p className={`text-[11px] ${tw.tone}`}>{tw.text}</p>
              </div>
            </div>
            <LineChart
              values={view.visits}
              tone={tw.tone}
              startLabel={shortDate(view.dates[0])}
              endLabel={shortDate(view.dates.at(-1))}
              label={`${view.client.name}: modeled monthly visits over ${view.dates.length} weekly checks, ${tw.text.toLowerCase()}`}
            />
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
              Monthly searches × usual click share for each position <Basis>model</Basis>
            </p>
          </GlassCard>

          <SectionTitle aside={`now vs ${MOVER_WEEKS} weeks ago`}>Keywords</SectionTitle>
          <ul className="glass divide-y divide-line rounded-3xl px-3.5 lg:px-5">
            {view.rows.map((r) => (
              <li key={`${r.keyword}|${r.marketName}`} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.keyword}
                    {r.money && <span className="ml-1.5 rounded-full bg-lime/15 px-1.5 py-px text-[10px] font-semibold text-lime">money</span>}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {r.marketName} · {r.volume === null ? "searches not found" : `${r.volume.toLocaleString("en-US")}/mo`} · {packText(r.pack)} · best {pos(r.best)}
                  </p>
                </div>
                <Sparkline values={r.series} invert tone="text-sky" label={`${r.keyword} in ${r.marketName}: position over time`} />
                <div className="w-16 text-right">
                  <p className="text-sm font-semibold tabular-nums">{pos(r.now)}</p>
                  <PositionChange from={r.weeksAgo} to={r.now} />
                </div>
              </li>
            ))}
          </ul>
        </Column>

        <Column>
          <SectionTitle aside="average position on your keywords">Competitors</SectionTitle>
          <ul className="glass space-y-2 rounded-3xl p-3.5 lg:p-5">
            {view.competitors.map((c) => (
              <li key={c.domain} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{c.domain}</span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold tabular-nums">{c.avgNow === null ? "not seen" : `#${c.avgNow}`}</span>{" "}
                  <PositionChange from={c.avgThen === null ? null : Math.round(c.avgThen)} to={c.avgNow === null ? null : Math.round(c.avgNow)} />
                </span>
              </li>
            ))}
          </ul>

          <SectionTitle aside={view.upsell.due ? "would show" : "would stay hidden"}>Upsell in next report?</SectionTitle>
          <div className="glass space-y-2 rounded-3xl p-3.5 lg:p-5">
            <p className="text-sm">
              {view.upsell.due ? (
                <>
                  <span className="font-semibold text-teal">It&apos;s their time.</span> Suggested next step: <span className="font-semibold">{view.upsell.idea}</span>
                </>
              ) : (
                <span className="text-muted">Not their time yet. The section stays off until every check passes.</span>
              )}
            </p>
            <ul className="space-y-1">
              {view.upsell.checks.map((c) => (
                <li key={c.label} className="flex items-start gap-1.5 text-xs">
                  {c.ok ? <CheckCircle2 aria-hidden className="mt-px size-3.5 shrink-0 text-teal" /> : <Circle aria-hidden className="mt-px size-3.5 shrink-0 text-faint" />}
                  <span className={c.ok ? "text-ink" : "text-muted"}>
                    <span className="sr-only">{c.ok ? "Passes: " : "Not yet: "}</span>
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-faint">A person can still switch it on or off for any report. Reports come in Phase D.</p>
          </div>
        </Column>
      </Columns>
    </>
  );
}
