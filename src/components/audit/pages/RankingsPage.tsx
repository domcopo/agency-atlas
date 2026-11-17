// Page 2: where the demand lives and where the client ranks on the money terms.

import type { AuditBundle } from "@/lib/audit/data";
import { DemandBars } from "../DemandBars";
import { PositionMatrix } from "../PositionMatrix";
import { Slide } from "../Slide";

export function RankingsPage({ bundle }: { bundle: AuditBundle }) {
  const { config, data } = bundle;
  const names = new Map(config.markets.map((m) => [m.id, m]));
  const bars = [
    { label: "“Near me” searches (location decided by Google)", fig: data.nearMeSearches },
    ...data.demand.map((d) => ({ label: names.get(d.marketId)?.name ?? d.marketId, fig: d.searches, highlight: names.get(d.marketId)?.hq })),
  ];
  const money = data.keywords.filter((k) => k.money);
  const cols = [
    { domain: config.company.domain, label: "You", isClient: true },
    ...config.competitors.slice(0, 3).map((c) => ({ domain: c.domain, label: c.name.replace(/\s*\(.*\)$/, "").split(" ")[0] ?? c.name })),
  ];
  return (
    <Slide bundle={bundle} page={2} title="Local rankings & search demand" aside={config.company.region}>
      <div className="audit-row" style={{ flex: 1 }}>
        <div className="audit-card" style={{ flex: 1 }}>
          <h3>Where the demand lives (searches / month)</h3>
          <DemandBars rows={bars} />
          <p className="audit-note">Each market counted once. Markets with no figure show “not found”; they are left out of totals, never guessed.</p>
        </div>
        <div className="audit-card" style={{ flex: 1.2 }}>
          <h3>Where you rank on the money terms (Google organic)</h3>
          <PositionMatrix keywords={money} columns={cols} />
          <p className="audit-note">— = not in the top 100.</p>
        </div>
      </div>
      {data.narrative.pageNotes.rankings && <div className="audit-callout"><span className="audit-tag info">What this means</span>{data.narrative.pageNotes.rankings}</div>}
    </Slide>
  );
}
