// The client against the top competitors: reviews, rankings, visits, authority.

import { totalVisits } from "@/lib/audit/compute";
import type { SiteMetrics } from "@/lib/audit/data";
import { fmtNum } from "@/lib/audit/format";
import { FigValue, Missing } from "./Bits";

export interface CompetitorRow {
  name: string;
  town: string;
  isClient: boolean;
  site: SiteMetrics;
}

export function CompetitorTable({ rows, showSemrush }: { rows: CompetitorRow[]; showSemrush: boolean }) {
  return (
    <table className="audit-table compact" style={{ fontSize: 12.5 }}>
      <thead>
        <tr>
          <th>Business</th>
          <th>Town</th>
          <th className="num">Pack</th>
          <th className="num">Google reviews</th>
          <th className="num">Org. kws</th>
          <th className="num">Org. visits</th>
          <th className="num">Pack visits</th>
          <th className="num">Total est./mo</th>
          {showSemrush && <th className="num">Semrush visits</th>}
          <th className="num">Backlink rank</th>
          <th className="num">Ref. domains</th>
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
              <td className="num"><FigValue fig={site.organicVisits} /></td>
              <td className="num"><FigValue fig={site.packVisits} /></td>
              <td className="num"><b>{total === null ? <Missing /> : fmtNum(total)}</b></td>
              {showSemrush && <td className="num"><FigValue fig={site.semrushVisits} /></td>}
              <td className="num"><FigValue fig={site.backlinkRank} /></td>
              <td className="num"><FigValue fig={site.referringDomains} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
