// LeadSnap-style geo-grid: the client's Google Maps rank at each point around the office.

import { gridStats } from "@/lib/audit/compute";
import type { GeoGrid } from "@/lib/audit/data";
import { fmtNum, fmtPct } from "@/lib/audit/format";
import { rankBand } from "./Bits";

export function HeatGrid({ grid }: { grid: GeoGrid }) {
  const s = gridStats(grid);
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>&ldquo;{grid.term}&rdquo;</p>
      <p style={{ fontSize: 11, color: "var(--a-muted)", margin: "2px 0 6px" }}>
        Avg rank <b>{fmtNum(s.avg, 2)}</b> · top 3 at <b>{fmtPct(s.top3Share)}</b>
      </p>
      <div className="audit-grid" style={{ gridTemplateColumns: `repeat(${grid.size}, 1fr)` }}>
        {grid.ranks.flat().map((r, i) => (
          <span key={i} className={r === null ? "none" : rankBand(r)}>
            {r === null ? "20+" : r}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HeatLegend() {
  return (
    <p style={{ fontSize: 11, color: "var(--a-muted)", display: "flex", gap: 14, margin: 0 }}>
      <span><span className="audit-pos top">1–3</span> in the map pack</span>
      <span><span className="audit-pos mid">4–10</span></span>
      <span><span className="audit-pos low">11–20</span></span>
      <span>grey = not in the top 20</span>
    </p>
  );
}
