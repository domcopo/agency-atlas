// The client against the top competitors: reviews, rankings, visits, authority.
// Columns with no data in this audit are left out (e.g. links before D3, pack visits in a
// Run audit); D1 adds local "top 3 / top 10", "positioned for" and brand searches.

import { totalVisits } from "@/lib/audit/compute";
import type { Fig, SiteMetrics } from "@/lib/audit/data";
import { fmtNum } from "@/lib/audit/format";
import { FigValue, Missing } from "./Bits";

export interface CompetitorRow {
  name: string;
  town: string;
  isClient: boolean;
  site: SiteMetrics;
}

const has = (rows: CompetitorRow[], pick: (s: SiteMetrics) => Fig | undefined) => rows.some((r) => pick(r.site)?.value != null);

export function CompetitorTable({ rows, showSemrush, local = false }: { rows: CompetitorRow[]; showSemrush: boolean; local?: boolean }) {
  const show = {
    packVisits: has(rows, (s) => s.packVisits),
    tops: has(rows, (s) => s.top10),
    positioned: has(rows, (s) => s.positionedFor),
    brand: has(rows, (s) => s.brandSearches),
    links: has(rows, (s) => s.backlinkRank) || has(rows, (s) => s.referringDomains),
  };
  return (
    <table className="audit-table compact" style={{ fontSize: 12.5 }}>
      <thead>
        <tr>
          <th>Business</th>
          <th>Town</th>
          <th className="num">Pack</th>
          <th className="num">Google reviews</th>
          <th className="num">{local ? "Local kws" : "Org. kws"}</th>
          {show.tops && <th className="num">Top 3 / 10</th>}
          {show.positioned && <th className="num">Positioned for</th>}
          <th className="num">{local ? "Local visits" : "Org. visits"}</th>
          {show.packVisits && <th className="num">Pack visits</th>}
          {show.packVisits && <th className="num">Total est./mo</th>}
          {showSemrush && <th className="num">Semrush visits</th>}
          {show.brand && <th className="num">Brand searches</th>}
          {show.links && <th className="num">Backlink rank</th>}
          {show.links && <th className="num">Ref. domains</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ name, town, isClient, site }) => {
          const total = totalVisits(site);
          return (
            <tr key={site.domain} className={isClient ? "you" : undefined}>
              <td>
                {name}
                <span className="sub">{site.domain}</span>
              </td>
              <td>{town}</td>
              <td className="num">
                <FigValue fig={site.packPosition} format={(v) => (v === 0 ? "—" : `#${v}`)} />
              </td>
              <td className="num">
                <FigValue fig={site.gbpRating} format={(v) => `${v.toFixed(1)}★`} /> / <FigValue fig={site.gbpReviews} />
              </td>
              <td className="num"><FigValue fig={site.organicKeywords} /></td>
              {show.tops && (
                <td className="num">
                  <FigValue fig={site.top3} /> / <FigValue fig={site.top10} />
                </td>
              )}
              {show.positioned && <td className="num"><FigValue fig={site.positionedFor} /></td>}
              <td className="num">{show.packVisits ? <FigValue fig={site.organicVisits} /> : <b><FigValue fig={site.organicVisits} /></b>}</td>
              {show.packVisits && <td className="num"><FigValue fig={site.packVisits} /></td>}
              {show.packVisits && <td className="num"><b>{total === null ? <Missing /> : fmtNum(total)}</b></td>}
              {showSemrush && <td className="num"><FigValue fig={site.semrushVisits} /></td>}
              {show.brand && <td className="num"><FigValue fig={site.brandSearches} /></td>}
              {show.links && <td className="num"><FigValue fig={site.backlinkRank} /></td>}
              {show.links && <td className="num"><FigValue fig={site.referringDomains} /></td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
