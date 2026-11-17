// Search-visit leaderboard: who gets the most estimated visits from Google.
// When Semrush ran too, its estimate sits beside DataForSEO's (never merged).

import type { LeaderRow } from "@/lib/audit/compute";
import { fmtNum, fmtUsd } from "@/lib/audit/format";
import { Missing } from "./Bits";

export function Leaderboard({ rows, showSemrush }: { rows: LeaderRow[]; showSemrush: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.visits ?? 0));
  return (
    <table className="audit-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Business</th>
          <th style={{ width: 150 }} />
          <th className="num">Est. visits/mo</th>
          {showSemrush && <th className="num">Semrush visits</th>}
          <th className="num">Traffic value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.domain} className={r.isClient ? "you" : undefined}>
            <td>{i + 1}</td>
            <td>{r.name}</td>
            <td>
              <div className={`audit-bar${r.isClient ? " you" : ""}`}>
                <span style={{ width: `${((r.visits ?? 0) / max) * 100}%` }} />
              </div>
            </td>
            <td className="num">{r.visits === null ? <Missing /> : fmtNum(r.visits)}</td>
            {showSemrush && <td className="num">{r.semrushVisits === null ? <Missing /> : fmtNum(r.semrushVisits)}</td>}
            <td className="num">{r.trafficValueUsd === null ? <Missing /> : `${fmtUsd(r.trafficValueUsd, { exact: true })}/mo`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
