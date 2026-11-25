// Page 4: top competitors (traffic, rankings, authority, reviews) + keyword matrix.

import type { AuditPageProps } from "../Slide";
import { shortLabels } from "@/lib/audit/format";
import { CompetitorTable } from "../CompetitorTable";
import { PositionMatrix } from "../PositionMatrix";
import { Slide } from "../Slide";

export function CompetitorsPage({ bundle, pageNo, pageCount }: AuditPageProps) {
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
    <Slide bundle={bundle} page={pageNo ?? 4} pageCount={pageCount} title={`Top ${config.competitors.length} competitors`} aside="traffic · rankings · authority · reviews">
      <div className="audit-card">
        <CompetitorTable rows={rows} showSemrush={config.modules.semrush} local={data.visitsScope === "local"} />
        <p className="audit-note">
          Pack: — = checked, not in the local 3-pack. Visits are search-only estimates, not total website traffic.
          {data.visitsScope === "local" ? " Local = searches naming this area's towns, the state or \"near me\"; visits = each ranking × the state's monthly searches × the usual click share for that position (a model). Positioned for = monthly searches on terms where it holds a top-10 spot. Traffic value = what those visits would cost as Google Ads at today's cost per click (a model, not revenue). Brand searches are US-wide." : ""}{" "}
          {data.narrative.pageNotes.competitors ?? ""}
        </p>
      </div>
      <div className="audit-card" style={{ flex: 1, overflow: "hidden" }}>
        <h3>Keyword ranking matrix (Google organic position)</h3>
        <PositionMatrix keywords={data.keywords.filter((k) => k.money).slice(0, 4)} columns={cols} showVolume={false} />
      </div>
    </Slide>
  );
}
