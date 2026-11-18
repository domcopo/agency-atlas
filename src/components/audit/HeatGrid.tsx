// Heat grid. Two kinds:
// - "maps": LeadSnap-style Google Maps rank at evenly spaced points around the office.
// - "pack": the Google local 3-pack as seen from each served city (cells named by city).

import { gridStats } from "@/lib/audit/compute";
import type { GeoGrid } from "@/lib/audit/data";
import { fmtNum, fmtPct } from "@/lib/audit/format";
import { rankBand } from "./Bits";

export function HeatGrid({ grid }: { grid: GeoGrid }) {
  const s = gridStats(grid);
  const pack = grid.kind === "pack";
  const cols = grid.ranks[0]?.length ?? grid.size;
  const labels = grid.cellLabels?.flat() ?? [];
  const inPack = grid.ranks.flat().filter((r) => r !== null && r >= 1 && r <= 3).length;
  const checked = grid.ranks.flat().filter((r) => r !== null).length;
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>&ldquo;{grid.term}&rdquo;</p>
      <p style={{ fontSize: 11, color: "var(--a-muted)", margin: "2px 0 6px" }}>
        {pack ? (
          <>
            In the 3-pack in <b>{inPack}</b> of {checked} cities checked
          </>
        ) : (
          <>
            Avg rank <b>{fmtNum(s.avg, 2)}</b> · top 3 at <b>{fmtPct(s.top3Share)}</b>
          </>
        )}
      </p>
      <div className="audit-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {grid.ranks.flat().map((r, i) => {
          const cls = r === null ? "none" : r === 0 ? "out" : rankBand(r);
          const text = pack ? (r === null ? "n/a" : r === 0 ? "—" : `#${r}`) : r === null ? "20+" : String(r);
          return (
            <span key={i} className={`${cls}${pack ? " labeled" : ""}`} title={labels[i] ?? undefined}>
              {text}
              {pack && labels[i] && <small>{labels[i]}</small>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function HeatLegend({ kind = "maps" }: { kind?: "maps" | "pack" }) {
  if (kind === "pack") {
    return (
      <p style={{ fontSize: 11, color: "var(--a-muted)", display: "flex", gap: 14, margin: 0, flexWrap: "wrap" }}>
        <span><span className="audit-pos top">#1–3</span> in the local 3-pack</span>
        <span><span className="audit-pos low">—</span> pack shown, not in it</span>
        <span>grey n/a = no pack shown or city not available</span>
      </p>
    );
  }
  return (
    <p style={{ fontSize: 11, color: "var(--a-muted)", display: "flex", gap: 14, margin: 0 }}>
      <span><span className="audit-pos top">1–3</span> in the map pack</span>
      <span><span className="audit-pos mid">4–10</span></span>
      <span><span className="audit-pos low">11–20</span></span>
      <span>grey = not in the top 20</span>
    </p>
  );
}
