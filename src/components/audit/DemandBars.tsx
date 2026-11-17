// Demand by region: searches per month in each market, as bars.

import type { Fig } from "@/lib/audit/data";
import { FigValue } from "./Bits";

export interface DemandBar {
  label: string;
  fig: Fig;
  highlight?: boolean;
}

export function DemandBars({ rows }: { rows: DemandBar[] }) {
  const max = Math.max(1, ...rows.map((r) => r.fig.value ?? 0));
  return (
    <table className="audit-table">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className={r.highlight ? "you" : undefined}>
            <td style={{ width: "42%" }}>{r.label}</td>
            <td>
              <div className={`audit-bar${r.highlight ? " you" : ""}`}>
                <span style={{ width: `${((r.fig.value ?? 0) / max) * 100}%` }} />
              </div>
            </td>
            <td className="num" style={{ width: 110 }}>
              <FigValue fig={r.fig} format={(v) => `${v.toLocaleString("en-US")}/mo`} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
