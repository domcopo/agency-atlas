// One watched client: visibility line, keyword table, competitors. Used by the sample
// preview and the real Watcher. The upsell checklist only shows when `upsell` is on
// (the sample; real reports and their upsell rule come in Phase D).

import { CheckCircle2, Circle } from "lucide-react";
import type { ReactNode } from "react";
import { GlassCard } from "@/components/cards/GlassCard";
import { Column, Columns } from "@/components/shell/Columns";
import { SectionTitle } from "@/components/shell/PageHeader";
import { shortDate } from "@/components/watcher/Board";
import { Basis } from "@/components/watcher/Bits";
import { Change, LineChart, packText, pos, PositionChange, Sparkline, trendWord } from "@/components/watcher/Charts";
import { MOVER_WEEKS, type ClientView } from "@/lib/watch/view";

export function ClientDetail({ view, upsell = false, side }: { view: ClientView; upsell?: boolean; side?: ReactNode }) {
  const tw = trendWord(view.trend);
  return (
    <Columns layout="main">
      <Column>
        <GlassCard className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Visits from rankings / month</p>
              <p className="font-display text-3xl font-bold tabular-nums">{view.visits.length ? Math.round(view.visits.at(-1) ?? 0).toLocaleString("en-US") : "—"}</p>
            </div>
            <div className="text-right">
              <Change pct={view.changePct} />
              <p className={`text-[11px] ${tw.tone}`}>{tw.text}</p>
            </div>
          </div>
          {view.dates.length < 2 ? (
            <p className="py-6 text-center text-sm text-muted">{view.dates.length ? "The line starts after the second round of checks." : "No checks yet. Start a round once the lists are ready."}</p>
          ) : (
            <LineChart
              values={view.visits}
              tone={tw.tone}
              startLabel={shortDate(view.dates[0])}
              endLabel={shortDate(view.dates.at(-1))}
              label={`${view.client.name}: modeled monthly visits over ${view.dates.length} checks, ${tw.text.toLowerCase()}`}
            />
          )}
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
            Monthly searches × usual click share for each position <Basis>model</Basis>
          </p>
        </GlassCard>

        <SectionTitle aside={`now vs ${MOVER_WEEKS} checks ago`}>Rankings</SectionTitle>
        {view.rows.length === 0 ? (
          <p className="glass rounded-3xl p-4 text-sm text-muted">No rankings yet.</p>
        ) : (
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
        )}
      </Column>

      <Column>
        {side}
        <SectionTitle aside="average position on your keywords">Competitors</SectionTitle>
        <ul className="glass space-y-2 rounded-3xl p-3.5 lg:p-5">
          {view.competitors.length === 0 && <li className="text-sm text-muted">None listed yet.</li>}
          {view.competitors.map((c) => (
            <li key={c.domain} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{c.domain}</span>
              <span className="shrink-0 text-right">
                <span className="font-semibold tabular-nums">{c.avgNow === null ? "not seen" : `#${c.avgNow}`}</span>{" "}
                {c.avgNow !== null && <PositionChange from={c.avgThen === null ? null : Math.round(c.avgThen)} to={Math.round(c.avgNow)} />}
              </span>
            </li>
          ))}
        </ul>

        {upsell && (
          <>
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
          </>
        )}
      </Column>
    </Columns>
  );
}
