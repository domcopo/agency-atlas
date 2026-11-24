// The SEO Watcher board: agency index, client tickers, movers, rising competitors and
// spotted trends. Used by the sample preview and the real Watcher (same look, same math).

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { GlassCard } from "@/components/cards/GlassCard";
import { Column, Columns } from "@/components/shell/Columns";
import { SectionTitle } from "@/components/shell/PageHeader";
import { Basis } from "@/components/watcher/Bits";
import { Change, LineChart, pos, PositionChange, Sparkline, trendWord } from "@/components/watcher/Charts";
import { MOVER_WEEKS, type BoardView, type NamedMover } from "@/lib/watch/view";

const visitsText = (n: number) => `${Math.round(n).toLocaleString("en-US")}`;
export const shortDate = (d: string | null | undefined) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";

export function WatchBoard({ board, clientHref, side }: { board: BoardView; clientHref: (clientId: string) => string; side?: ReactNode }) {
  const lastIndex = board.agencyIndex.at(-1);
  const few = board.dates.length < 2;
  return (
    <Columns layout="main">
      <Column>
        <GlassCard className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Agency index</p>
              <p className="font-display text-3xl font-bold tabular-nums">{lastIndex ?? "—"}</p>
            </div>
            <div className="text-right">
              <Change pct={board.agencyChangePct} />
              <p className="text-[11px] text-faint">last {MOVER_WEEKS} weeks</p>
            </div>
          </div>
          {few ? (
            <p className="py-6 text-center text-sm text-muted">The line starts after the second round of checks.</p>
          ) : (
            <LineChart
              values={board.agencyIndex}
              startLabel={shortDate(board.dates[0])}
              endLabel={shortDate(board.dates.at(-1))}
              label={`Agency visibility index over ${board.dates.length} checks, now ${lastIndex ?? "unknown"} (100 = first check)`}
            />
          )}
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
            100 = first check. Visibility = monthly searches × the usual click share for each position <Basis>model</Basis>
          </p>
        </GlassCard>

        <SectionTitle aside={<Basis>model visits / month</Basis>}>Clients</SectionTitle>
        <ul className="space-y-2">
          {board.tickers.map((t) => {
            const tw = trendWord(t.trend);
            return (
              <li key={t.client.id}>
                <GlassCard href={clientHref(t.client.id)} label={`Open ${t.client.name}`} padding="tight" className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.client.name}</p>
                    <p className="text-[11px] text-muted">
                      {t.client.niche} · top 3 on {t.top3}/{t.pairs} · Maps top 3 on {t.inPack}
                    </p>
                  </div>
                  <Sparkline values={t.spark} tone={tw.tone} label={`${t.client.name}: ${tw.text.toLowerCase()}`} />
                  <div className="w-20 text-right">
                    <p className="text-sm font-semibold tabular-nums">{visitsText(t.visits)}</p>
                    <Change pct={t.changePct} />
                  </div>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />
                </GlassCard>
              </li>
            );
          })}
        </ul>
      </Column>

      <Column>
        {side}
        <SectionTitle aside={board.movers.from && board.movers.to ? `${shortDate(board.movers.from)} → ${shortDate(board.movers.to)}` : undefined}>Biggest movers</SectionTitle>
        <MoverList title="Up" items={board.movers.up} />
        <MoverList title="Down" items={board.movers.down} />

        <SectionTitle aside={board.risersFrom ? `since ${shortDate(board.risersFrom)}` : undefined}>Competitors on the rise</SectionTitle>
        <div className="glass rounded-3xl p-3.5 lg:p-5">
          {board.risers.length === 0 ? (
            <p className="text-sm text-muted">No competitor gained on your keywords{few ? " yet" : ""}.</p>
          ) : (
            <ul className="space-y-2">
              {board.risers.map((r) => (
                <li key={r.domain} className="text-sm">
                  <p className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{r.domain}</span>
                    <span className="shrink-0 text-xs font-semibold text-rose tabular-nums">+{visitsText(r.visitsChange)} visits</span>
                  </p>
                  <p className="text-[11px] text-muted">
                    Moved up on {r.gains} keyword{r.gains === 1 ? "" : "s"} · crowding {r.clientNames.join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <SectionTitle aside={<Basis>inferred</Basis>}>Trends we spotted</SectionTitle>
        <ul className="glass space-y-2 rounded-3xl p-3.5 lg:p-5">
          {board.spotted.length === 0 && <li className="text-sm text-muted">Nothing stands out yet. Trends need at least 4 checks.</li>}
          {board.spotted.map((s, i) => (
            <li key={i} className="text-sm">
              <p>
                <span className="font-semibold">{s.clientName}:</span>{" "}
                <span className={s.kind === "rising" || s.kind === "joined_pack" || s.kind === "demand_up" ? "text-teal" : "text-rose"}>{s.text}</span>
              </p>
              <p className="text-[11px] text-faint">{s.basis}</p>
            </li>
          ))}
        </ul>
      </Column>
    </Columns>
  );
}

function MoverList({ title, items }: { title: "Up" | "Down"; items: NamedMover[] }) {
  return (
    <div className="glass mb-2.5 rounded-3xl p-3.5 lg:p-5">
      <p className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${title === "Up" ? "text-teal" : "text-rose"}`}>{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">None this period.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={`${m.keywordId}|${m.marketId}`} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">&ldquo;{m.keyword}&rdquo;</p>
                <p className="truncate text-[11px] text-muted">
                  {m.clientName} · {m.marketName} · {pos(m.from)} → {pos(m.to)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <PositionChange from={m.from} to={m.to} />
                <p className="text-[11px] tabular-nums text-faint">
                  {m.visitsChange === null ? "volume not found" : `${m.visitsChange > 0 ? "+" : ""}${Math.round(m.visitsChange)} visits`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
