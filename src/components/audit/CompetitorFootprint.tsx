// Which markets each site holds a ranking page in (compact list under the map).

import type { AuditMarket } from "@/lib/audit/config";

export interface FootprintRow {
  name: string;
  domain: string;
  isClient: boolean;
  marketIds: string[];
}

export function CompetitorFootprint({ rows, markets }: { rows: FootprintRow[]; markets: AuditMarket[] }) {
  const names = new Map(markets.map((m) => [m.id, m.name.replace(/\s*\(.*\)$/, "")]));
  const max = Math.max(1, ...rows.map((r) => r.marketIds.length));
  return (
    <table className="audit-table" style={{ fontSize: 11.5 }}>
      <thead>
        <tr>
          <th>Who holds ranking pages where</th>
          <th className="num" style={{ width: 70 }}>Markets</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.domain} className={r.isClient ? "you" : undefined}>
            <td style={{ padding: "5px 6px" }}>
              <b>{r.name.replace(/\s*\((sample|fictional)\)$/, "")}</b>
              <span className="sub">{r.marketIds.length ? r.marketIds.map((id) => names.get(id) ?? id).join(", ") : "none"}</span>
            </td>
            <td className="num" style={{ padding: "5px 6px" }}>
              <div className={`audit-bar${r.isClient ? " you" : ""}`} style={{ height: 6, marginBottom: 3 }}>
                <span style={{ width: `${(r.marketIds.length / max) * 100}%` }} />
              </div>
              {r.marketIds.length}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
