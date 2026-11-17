// Side by side: what competitors have that the client doesn't, graded gap/partial/good.

import type { ScorecardRow } from "@/lib/audit/data";
import { GradeTag } from "./Bits";

export function Scorecard({ rows, clientLabel }: { rows: ScorecardRow[]; clientLabel: string }) {
  return (
    <table className="audit-table" style={{ fontSize: 12.5 }}>
      <thead>
        <tr>
          <th>Signal</th>
          <th>Competitors</th>
          <th>{clientLabel} today</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.signal}>
            <td style={{ fontWeight: 700, width: "20%" }}>{r.signal}</td>
            <td style={{ width: "38%" }}>{r.competitors}</td>
            <td>
              <GradeTag grade={r.grade} />
              {r.client}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
