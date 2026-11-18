// Region map: the state's outline, one dot per market (colored by the client's best
// organic position there, sized by local searches), and mile rings around the home base.
// Positions come from each market's latitude/longitude in the settings.
//
// view "state"   = the whole state, names next to the dots (good for a few spread-out cities).
// view "markets" = zoomed in on the markets, numbered dots with a key on the right and a
//                  small whole-state inset (good for many cities in one metro).

import type { AuditMarket } from "@/lib/audit/config";
import { boundsOf, fitBounds, fitState, outlinePath, padBounds, STATES, type LngLat } from "@/lib/audit/geo";

export interface MapPoint {
  market: AuditMarket;
  searches: number | null;
  position: number | null;
}

const COLORS = { top: "#12c48b", mid: "#f5b82e", low: "#e8426a", none: "#94a3b8" };
const W = 460;
const H = 330;

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const band = (p: number | null) => (p === null ? "none" : p <= 3 ? "top" : p <= 10 ? "mid" : "low");
const searchText = (s: number | null) => (s === null ? "searches not found" : `${s.toLocaleString("en-US")}/mo`);
const posText = (p: number | null) => (p === null ? "not ranking" : `you #${p}`);

interface Props {
  points: MapPoint[];
  state: string;
  ringsMiles: number[];
  view?: "state" | "markets";
}

export function StateMap({ points, state, ringsMiles, view = "state" }: Props) {
  const shape = STATES[state];
  if (!shape) return <p className="audit-nf">Map not available for this state.</p>;
  const placed = points.filter((p) => p.market.lat !== undefined && p.market.lng !== undefined);
  const hq = placed.find((p) => p.market.hq);
  const zoom = view === "markets" && placed.length > 0;
  const keyW = zoom ? 170 : 0;
  const mapW = W - keyW;
  const side = zoom ? 6 : 70;

  // Zoomed: fit the markets plus the outer ring (or 8 miles) instead of the whole state.
  const area = zoom ? padBounds(boundsOf(placed.map((p) => [p.market.lng!, p.market.lat!] as LngLat)), 3) : null;
  const proj = area ? fitBounds(area, mapW - 2 * side, H) : fitState(shape, mapW - 2 * side, H);
  const dx = (mapW - proj.width) / 2;
  const dy = (H - proj.height) / 2;
  const at = (lng: number, lat: number): [number, number] => {
    const [x, y] = proj.project([lng, lat]);
    return [x + dx, y + dy];
  };
  const maxS = Math.max(1, ...placed.map((p) => p.searches ?? 0));
  const ordered = [...placed].sort((a, b) => (b.searches ?? -1) - (a.searches ?? -1));
  const num = new Map(ordered.map((p, i) => [p.market.id, i + 1]));

  // Names beside dots (whole-state view): try right, left, below, above; skip spots already taken.
  const taken: Box[] = placed.map((p) => {
    const [x, y] = at(p.market.lng!, p.market.lat!);
    return { x: x - 5, y: y - 5, w: 10, h: 10 };
  });
  const labels = zoom
    ? []
    : placed.map((p) => {
        const [x, y] = at(p.market.lng!, p.market.lat!);
        const line1 = `${p.market.name}${p.market.hq ? " · HQ" : ""}`;
        const line2 = `${searchText(p.searches)} · ${posText(p.position)}`;
        const w = Math.max(line1.length * 6.2, line2.length * 4.9) + 4;
        const h = 24;
        const tries: Box[] = [
          { x: x + 8, y: y - 12, w, h },
          { x: x - 8 - w, y: y - 12, w, h },
          { x: x - w / 2, y: y + 8, w, h },
          { x: x - w / 2, y: y - 8 - h, w, h },
        ];
        const box = tries.find((b) => b.x >= 0 && b.x + b.w <= mapW && b.y >= 0 && b.y + b.h <= H && !taken.some((t) => overlaps(t, b))) ?? tries[0]!;
        taken.push(box);
        const anchorEnd = box.x + box.w <= x;
        return { id: p.market.id, line1, line2, tx: anchorEnd ? box.x + box.w : box.x, ty: box.y, anchor: (anchorEnd ? "end" : "start") as "end" | "start" };
      });

  const inView = (lng: number, lat: number) => {
    const [x, y] = at(lng, lat);
    return x > 4 && x < mapW - 4 && y > 4 && y < H - 4;
  };
  const nearMarket = (lng: number, lat: number) => placed.some((p) => Math.abs(p.market.lng! - lng) < (zoom ? 0.05 : 0.35) && Math.abs(p.market.lat! - lat) < (zoom ? 0.05 : 0.35));
  const clipId = `clip-${shape.code}-${zoom ? "z" : "s"}`;
  const viewClip = `view-${shape.code}-${zoom ? "z" : "s"}`;

  // Inset: the whole state, small, with a box showing the zoomed area.
  const inset = zoom && area ? fitState(shape, 64, 74, 2) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${shape.name} with the client's best position in each market`} style={{ width: "100%", height: "100%" }}>
      <defs>
        <clipPath id={clipId}>
          <path d={outlinePath(shape, proj)} transform={`translate(${dx} ${dy})`} />
        </clipPath>
        <clipPath id={viewClip}>
          <rect x="0" y="0" width={mapW} height={H} rx="6" />
        </clipPath>
      </defs>
      {zoom && <rect x="0" y="0" width={mapW} height={H} rx="6" fill="#f7fafc" />}
      <g clipPath={`url(#${viewClip})`}>
        <path d={outlinePath(shape, proj)} transform={`translate(${dx} ${dy})`} fill="#eef4f8" stroke="#9fb3c4" strokeWidth="1.2" strokeLinejoin="round" />
        {hq && (
          <g clipPath={`url(#${clipId})`}>
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
          .filter((l) => !nearMarket(l.at[0], l.at[1]) && inView(l.at[0], l.at[1]))
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
          return <circle key={`h-${p.market.id}`} cx={x} cy={y} r={(zoom ? 3 : 4) + (zoom ? 12 : 12) * Math.sqrt((p.searches ?? 0) / maxS)} fill="#00a9cc" fillOpacity="0.14" />;
        })}
        {placed.map((p) => {
          const [x, y] = at(p.market.lng!, p.market.lat!);
          return zoom ? (
            <g key={p.market.id}>
              <circle cx={x} cy={y} r="5.6" fill={COLORS[band(p.position)]} stroke={p.market.hq ? "#0b2340" : "#fff"} strokeWidth={p.market.hq ? 2 : 1.5} />
              <text x={x} y={y + 2.6} fontSize="7" fontWeight="800" textAnchor="middle" fill="#fff">
                {num.get(p.market.id)}
              </text>
            </g>
          ) : (
            <circle key={p.market.id} cx={x} cy={y} r={p.market.hq ? 5.5 : 4.5} fill={COLORS[band(p.position)]} stroke="#fff" strokeWidth="1.5" />
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
      </g>
      {inset && area && (
        <g transform={`translate(${mapW - 72} 6)`}>
          <rect x="-3" y="-3" width="70" height="80" rx="4" fill="#fff" fillOpacity="0.92" stroke="#d5dee7" />
          <path d={outlinePath(shape, inset)} fill="#e3ebf2" stroke="#9fb3c4" strokeWidth="0.8" />
          {(() => {
            const [x1, y1] = inset.project([area.minLng, area.maxLat]);
            const [x2, y2] = inset.project([area.maxLng, area.minLat]);
            return <rect x={x1} y={y1} width={Math.max(3, x2 - x1)} height={Math.max(3, y2 - y1)} fill="none" stroke="#e8426a" strokeWidth="1.4" />;
          })()}
        </g>
      )}
      {zoom && (
        <g transform={`translate(${mapW + 10} 4)`}>
          {ordered.map((p, i) => {
            const rowH = Math.min(21, (H - 8) / Math.max(1, ordered.length));
            const y = i * rowH;
            return (
              <g key={p.market.id} transform={`translate(0 ${y})`}>
                <circle cx="7" cy="7" r="6.5" fill={COLORS[band(p.position)]} stroke={p.market.hq ? "#0b2340" : "none"} strokeWidth="1.5" />
                <text x="7" y="10" fontSize="7.5" fontWeight="800" textAnchor="middle" fill="#fff">
                  {i + 1}
                </text>
                <text x="18" y="7.5" fontSize="9.5" fontWeight="700" fill="#0b2340">
                  {p.market.name}
                  {p.market.hq ? " · HQ" : ""}
                </text>
                <text x="18" y="16" fontSize="7.8" fill="#53627a">
                  {searchText(p.searches)} · {posText(p.position)}
                </text>
              </g>
            );
          })}
        </g>
      )}
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
