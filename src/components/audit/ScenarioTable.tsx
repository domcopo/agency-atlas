// Revenue scenarios: visits × lead rate × close rate × average job value. Always a model.

import type { ScenarioRow } from "@/lib/audit/compute";
import { fmtNum, fmtPct, fmtUsd } from "@/lib/audit/format";

export function ScenarioTable({ rows }: { rows: ScenarioRow[] }) {
  return (
    <table className="audit-table">
      <thead>
        <tr>
          <th>Scenario</th>
          <th className="num">Demand captured</th>
          <th className="num">Visits/mo</th>
          <th className="num">Leads/mo</th>
          <th className="num">Jobs/mo</th>
          <th className="num">Revenue/mo</th>
          <th className="num">Revenue/yr</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className={r.baseline ? "you" : undefined}>
            <td style={{ fontWeight: 700 }}>{r.name}</td>
            <td className="num">{fmtPct(r.demandCaptured, 1)}</td>
            <td className="num">{fmtNum(r.visits)}</td>
            <td className="num">{fmtNum(r.leads)}</td>
            <td className="num">{fmtNum(r.jobs, 1)}</td>
            <td className="num"><b>{fmtUsd(r.revenueMo)}</b></td>
            <td className="num"><b>{fmtUsd(r.revenueYr)}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
