// Search-visit leaderboard: who gets the most estimated visits from Google.
// When Semrush ran too, its estimate sits beside DataForSEO's (never merged).
// Optional: a modeled revenue column (visits × visit-to-job rate × job value). Competitors are
// numbered 1-5; the client sits below them with its overall place, then the dashed goal row.

import type { LeaderRow } from "@/lib/audit/compute";
import { fmtNum, fmtUsd } from "@/lib/audit/format";
import { Missing } from "./Bits";

export interface GoalRow {
  label: string;
  visits: number;
  revenueMo: number | null;
}

type Row = (LeaderRow & { goal?: false }) | (GoalRow & { goal: true });

export function Leaderboard({ rows, showSemrush, goal }: { rows: LeaderRow[]; showSemrush: boolean; goal?: GoalRow }) {
  // Like the agency's own audits: competitors ranked #1-5, then the business pinned below with
  // its real place among everyone, then the goal (never mixed into the ranking).
  const measuredRank = new Map(rows.filter((r) => r.visits !== null).map((r, i) => [r.domain, i + 1]));
  const all: Row[] = [...rows.filter((r) => !r.isClient), ...rows.filter((r) => r.isClient)];
  if (goal) all.push({ ...goal, goal: true });
  const max = Math.max(1, ...all.map((r) => r.visits ?? 0));
  const showValue = rows.some((r) => r.trafficValueUsd !== null);
  const showRevenue = rows.some((r) => r.revenueMo !== null);
  let place = 0;
  return (
    <table className="audit-table compact">
      <thead>
        <tr>
          <th>#</th>
          <th>Business</th>
          <th style={{ width: 130 }} />
          <th className="num">Est. visits/mo</th>
          {showSemrush && <th className="num">Semrush visits</th>}
          {showValue && <th className="num">Traffic value</th>}
          {showRevenue && <th className="num">Modeled revenue/mo</th>}
        </tr>
      </thead>
      <tbody>
        {all.map((r) => {
          if (r.goal) {
            return (
              <tr key="goal" className="goal">
                <td>→</td>
                <td>{r.label}</td>
                <td>
                  <div className="audit-bar goal">
                    <span style={{ width: `${(r.visits / max) * 100}%` }} />
                  </div>
                </td>
                <td className="num">≈{fmtNum(r.visits)}</td>
                {showSemrush && <td className="num" />}
                {showValue && <td className="num" />}
                {showRevenue && <td className="num">{r.revenueMo === null ? <Missing /> : `${fmtUsd(r.revenueMo)}`}</td>}
              </tr>
            );
          }
          // Not measured = no place: listing it below the client would claim the client beats it.
          const measured = r.visits !== null;
          if (measured && !r.isClient) place++;
          const youAt = measuredRank.get(r.domain);
          return (
            <tr key={r.domain} className={r.isClient ? "you" : undefined}>
              <td>{r.isClient ? (youAt ? `#${youAt}` : "–") : measured ? place : "–"}</td>
              <td>{r.name}</td>
              <td>
                <div className={`audit-bar${r.isClient ? " you" : ""}`}>
                  <span style={{ width: `${((r.visits ?? 0) / max) * 100}%` }} />
                </div>
              </td>
              <td className="num">{r.visits === null ? <Missing /> : fmtNum(r.visits)}</td>
              {showSemrush && <td className="num">{r.semrushVisits === null ? <Missing /> : fmtNum(r.semrushVisits)}</td>}
              {showValue && <td className="num">{r.trafficValueUsd === null ? <Missing /> : `${fmtUsd(r.trafficValueUsd, { exact: true })}/mo`}</td>}
              {showRevenue && <td className="num">{r.revenueMo === null ? <Missing /> : fmtUsd(r.revenueMo)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
