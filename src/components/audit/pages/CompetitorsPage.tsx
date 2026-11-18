// Page 4: top competitors (traffic, rankings, authority, reviews) + keyword matrix.

import type { AuditBundle } from "@/lib/audit/data";
import { shortLabels } from "@/lib/audit/format";
import { CompetitorTable } from "../CompetitorTable";
import { PositionMatrix } from "../PositionMatrix";
import { Slide } from "../Slide";

export function CompetitorsPage({ bundle }: { bundle: AuditBundle }) {
  const { config, data } = bundle;
  const byDomain = new Map(data.sites.map((s) => [s.domain, s]));
  const rows = [
    { name: config.company.name, town: config.company.hqTown, isClient: true, domain: config.company.domain },
    ...config.competitors.map((c) => ({ name: c.name, town: c.town, isClient: false, domain: c.domain })),
  ].flatMap((r) => {
    const site = byDomain.get(r.domain);
    return site ? [{ ...r, site }] : [];
  });
  const short = shortLabels(config.competitors.map((c) => c.name));
  const cols = [
    { domain: config.company.domain, label: "You", isClient: true },
    ...config.competitors.map((c, i) => ({ domain: c.domain, label: short[i] ?? c.name })),
  ];
  return (
    <Slide bundle={bundle} page={4} title={`Top ${config.competitors.length} competitors`} aside="traffic · rankings · authority · reviews">
      <div className="audit-card">
        <CompetitorTable rows={rows} showSemrush={config.modules.semrush} />
        <p className="audit-note">Pack: — = checked, not in the local 3-pack. Visits are search-only estimates, not total website traffic. {data.narrative.pageNotes.competitors ?? ""}</p>
      </div>
      <div className="audit-card" style={{ flex: 1, overflow: "hidden" }}>
        <h3>Keyword ranking matrix (Google organic position)</h3>
        <PositionMatrix keywords={data.keywords.filter((k) => k.money).slice(0, 4)} columns={cols} showVolume={false} />
      </div>
    </Slide>
  );
}
