// Page 2: where the demand lives and where the client ranks on the money terms.

import type { AuditPageProps } from "../Slide";
import { shortLabels } from "@/lib/audit/format";
import { DemandBars } from "../DemandBars";
import { PositionMatrix } from "../PositionMatrix";
import { Slide } from "../Slide";

export function RankingsPage({ bundle, pageNo, pageCount }: AuditPageProps) {
  const { config, data } = bundle;
  const names = new Map(config.markets.map((m) => [m.id, m]));
  const all = data.demand.map((d) => ({ label: names.get(d.marketId)?.name ?? d.marketId, fig: d.searches, highlight: names.get(d.marketId)?.hq }));
  // Many markets: show the biggest by name and add the rest up in one row (computed, never guessed).
  const MAX_ROWS = 9;
  const sorted = [...all].sort((a, b) => (b.fig.value ?? -1) - (a.fig.value ?? -1));
  const shown = all.length > MAX_ROWS ? sorted.slice(0, MAX_ROWS - 1) : all;
  const rest = all.length > MAX_ROWS ? sorted.slice(MAX_ROWS - 1) : [];
  const restFound = rest.filter((r) => r.fig.value !== null);
  const restMissing = rest.length - restFound.length;
  const bars = [
    { label: "“Near me” searches (location decided by Google)", fig: data.nearMeSearches },
    ...shown,
    ...(rest.length
      ? [
          {
            label: `${rest.length} more cities${restMissing ? ` (${restMissing} not found)` : ""}`,
            fig: { value: restFound.length ? restFound.reduce((s, r) => s + (r.fig.value ?? 0), 0) : null, source: "model" as const, retrieved: data.retrieved },
          },
        ]
      : []),
  ];
  const money = data.keywords.filter((k) => k.money);
  const short = shortLabels(config.competitors.map((c) => c.name));
  const cols = [
    { domain: config.company.domain, label: "You", isClient: true },
    ...config.competitors.slice(0, 3).map((c, i) => ({ domain: c.domain, label: short[i] ?? c.name })),
  ];
  return (
    <Slide bundle={bundle} page={pageNo ?? 2} pageCount={pageCount} title="Local rankings & search demand" aside={config.company.region}>
      <div className="audit-row" style={{ flex: 1 }}>
        <div className="audit-card" style={{ flex: 1 }}>
          <h3>Where the demand lives (searches / month)</h3>
          <DemandBars rows={bars} />
          <p className="audit-note">Each market counted once. Markets with no figure show “not found”; they are left out of totals, never guessed.</p>
        </div>
        <div className="audit-card" style={{ flex: 1.2 }}>
          <h3>Where you rank on the money terms (Google organic)</h3>
          <PositionMatrix keywords={money} columns={cols} />
          <p className="audit-note">— = not in the top {data.organicDepth ?? 100} results checked.</p>
        </div>
      </div>
      {data.narrative.pageNotes.rankings && <div className="audit-callout"><span className="audit-tag info">What this means</span>{data.narrative.pageNotes.rankings}</div>}
    </Slide>
  );
}
