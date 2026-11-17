// Region map: the state's outline, one dot per market (colored by the client's best
// organic position there, sized by local searches), and mile rings around the home base.
// Positions come from each market's latitude/longitude in the settings.

import type { AuditMarket } from "@/lib/audit/config";
import { fitState, outlinePath, STATES } from "@/lib/audit/geo";

export interface MapPoint {
  market: AuditMarket;
  searches: number | null;
  position: number | null;
}

const COLORS = { top: "#12c48b", mid: "#f5b82e", low: "#e8426a", none: "#94a3b8" };
const W = 460;
const H = 330;
const SIDE = 70; // room either side of the state for labels

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function StateMap({ points, state, ringsMiles }: { points: MapPoint[]; state: string; ringsMiles: number[] }) {
  const shape = STATES[state];
  if (!shape) return <p className="audit-nf">Map not available for this state.</p>;
  const proj = fitState(shape, W - 2 * SIDE, H);
  const dx = (W - proj.width) / 2;
  const dy = (H - proj.height) / 2;
  const at = (lng: number, lat: number): [number, number] => {
    const [x, y] = proj.project([lng, lat]);
    return [x + dx, y + dy];
  };
  const placed = points.filter((p) => p.market.lat !== undefined && p.market.lng !== undefined);
  const hq = placed.find((p) => p.market.hq);
  const maxS = Math.max(1, ...placed.map((p) => p.searches ?? 0));

  // Place each label right of its dot; if that hits another label or dot, try left, then below/above.
  const taken: Box[] = placed.map((p) => {
    const [x, y] = at(p.market.lng!, p.market.lat!);
    return { x: x - 5, y: y - 5, w: 10, h: 10 };
  });
  const labels = placed.map((p) => {
    const [x, y] = at(p.market.lng!, p.market.lat!);
    const line1 = `${p.market.name}${p.market.hq ? " · HQ" : ""}`;
    const line2 = `${p.searches === null ? "searches not found" : `${p.searches.toLocaleString("en-US")}/mo`} · ${p.position === null ? "not ranking" : `you #${p.position}`}`;
    const w = Math.max(line1.length * 6.2, line2.length * 4.9) + 4;
    const h = 24;
    const tries: Box[] = [
      { x: x + 8, y: y - 12, w, h },
      { x: x - 8 - w, y: y - 12, w, h },
      { x: x - w / 2, y: y + 8, w, h },
      { x: x - w / 2, y: y - 8 - h, w, h },
    ];
    const box = tries.find((b) => b.x >= 0 && b.x + b.w <= W && b.y >= 0 && b.y + b.h <= H && !taken.some((t) => overlaps(t, b))) ?? tries[0]!;
    taken.push(box);
    const anchorEnd = box.x + box.w <= x;
    return { id: p.market.id, line1, line2, tx: anchorEnd ? box.x + box.w : box.x, ty: box.y, anchor: (anchorEnd ? "end" : "start") as "end" | "start" };
  });

  const nearMarket = (lng: number, lat: number) => placed.some((p) => Math.abs(p.market.lng! - lng) < 0.35 && Math.abs(p.market.lat! - lat) < 0.35);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${shape.name} with the client's best position in each market`} style={{ width: "100%", height: "100%" }}>
      <defs>
        <clipPath id={`clip-${shape.code}`}>
          <path d={outlinePath(shape, proj)} transform={`translate(${dx} ${dy})`} />
        </clipPath>
      </defs>
      <path d={outlinePath(shape, proj)} transform={`translate(${dx} ${dy})`} fill="#eef4f8" stroke="#9fb3c4" strokeWidth="1.2" strokeLinejoin="round" />
      {hq && (
        <g clipPath={`url(#clip-${shape.code})`}>
          {ringsMiles.map((mi, i) => {
            const [x, y] = at(hq.market.lng!, hq.market.lat!);
            return <circle key={mi} cx={x} cy={y} r={mi * proj.pxPerMile} fill={i === 0 ? "#00a9cc" : "none"} fillOpacity={0.07} stroke="#00a9cc" strokeOpacity={0.55} strokeDasharray="4 4" strokeWidth="1" />;
          })}
        </g>
      )}
      {hq &&
        ringsMiles.map((mi) => {
          const [x, y] = at(hq.market.lng!, hq.market.lat!);
          return (
            <text key={mi} x={x} y={y - mi * proj.pxPerMile - 3} fontSize="8.5" textAnchor="middle" fill="#007c98">
              {mi} mi
            </text>
          );
        })}
      {shape.landmarks
        .filter((l) => !nearMarket(l.at[0], l.at[1]))
        .map((l) => {
          const [x, y] = at(l.at[0], l.at[1]);
          return (
            <g key={l.name} fill="#9fb3c4">
              <circle cx={x} cy={y} r="1.8" />
              <text x={x + 4} y={y + 3} fontSize="8">{l.name}</text>
            </g>
          );
        })}
      {placed.map((p) => {
        const [x, y] = at(p.market.lng!, p.market.lat!);
        const band = p.position === null ? "none" : p.position <= 3 ? "top" : p.position <= 10 ? "mid" : "low";
        return (
          <g key={p.market.id}>
            <circle cx={x} cy={y} r={4 + 12 * Math.sqrt((p.searches ?? 0) / maxS)} fill="#00a9cc" fillOpacity="0.14" />
            <circle cx={x} cy={y} r={p.market.hq ? 5.5 : 4.5} fill={COLORS[band]} stroke="#fff" strokeWidth="1.5" />
          </g>
        );
      })}
      {labels.map((l) => (
        <g key={l.id}>
          <text x={l.tx} y={l.ty + 10} fontSize="10.5" fontWeight="700" fill="#0b2340" textAnchor={l.anchor} stroke="#fff" strokeWidth="3" paintOrder="stroke">
            {l.line1}
          </text>
          <text x={l.tx} y={l.ty + 21} fontSize="8.5" fill="#53627a" textAnchor={l.anchor} stroke="#fff" strokeWidth="3" paintOrder="stroke">
            {l.line2}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function MapLegend() {
  const item = (c: string, t: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 9, height: 9, borderRadius: 99, background: c, display: "inline-block" }} />
      {t}
    </span>
  );
  return (
    <p style={{ fontSize: 10.5, color: "var(--a-muted)", display: "flex", flexWrap: "wrap", gap: 12, margin: 0 }}>
      {item(COLORS.top, "you #1–3")}
      {item(COLORS.mid, "#4–10")}
      {item(COLORS.low, "#11+")}
      {item(COLORS.none, "not ranking")}
      <span>halo = searches/mo · dashed = miles from HQ</span>
    </p>
  );
}
