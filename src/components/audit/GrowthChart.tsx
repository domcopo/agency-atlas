// 12-month modeled visits (S-curve), with competitors' current visits as reference lines.

export interface RefLine {
  label: string;
  value: number;
}

const REF_COLORS = ["#7c5cff", "#f5a524", "#8a99ab"];

/** Round axis steps: 1, 2, 2.5 or 5 × 10^n. */
function niceStep(max: number, ticks = 4): number {
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
}

export function GrowthChart({ curve, refs }: { curve: number[]; refs: RefLine[] }) {
  const W = 560;
  const H = 280;
  const L = 42;
  const R = 150; // room for reference-line labels
  const T = 18;
  const B = 26;
  const step = niceStep(Math.max(1, ...curve, ...refs.map((r) => r.value)));
  const top = Math.ceil(Math.max(1, ...curve, ...refs.map((r) => r.value)) / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const x = (i: number) => L + (i / (curve.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const pts = curve.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const last = curve[curve.length - 1] ?? 0;

  // Keep reference labels at least 12px apart vertically.
  const refLabels = [...refs]
    .map((r, i) => ({ ...r, color: REF_COLORS[i % REF_COLORS.length]!, ly: y(r.value) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < refLabels.length; i++) refLabels[i]!.ly = Math.max(refLabels[i]!.ly, refLabels[i - 1]!.ly + 12);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Modeled monthly visits over 12 months" style={{ width: "100%", height: "auto" }}>
      <defs>
        <linearGradient id="audit-growth-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#00a9cc" stopOpacity="0.22" />
          <stop offset="1" stopColor="#00a9cc" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#c9d3de" : "#edf1f5"} />
          <text x={L - 8} y={y(t) + 3.5} fontSize="10" textAnchor="end" fill="#8592a3">{t.toLocaleString("en-US")}</text>
        </g>
      ))}
      {refLabels.map((r) => (
        <g key={r.label}>
          <line x1={L} x2={W - R} y1={y(r.value)} y2={y(r.value)} stroke={r.color} strokeOpacity="0.8" strokeDasharray="5 4" />
          <circle cx={W - R + 8} cy={r.ly} r="3" fill={r.color} />
          <text x={W - R + 15} y={r.ly + 3.5} fontSize="10" fill="#33445c">
            {r.label} · {Math.round(r.value).toLocaleString("en-US")}
          </text>
        </g>
      ))}
      <path d={`M${pts[0]} L${pts.join(" L")} L${x(curve.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#audit-growth-fill)" />
      <polyline fill="none" stroke="#00a9cc" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={pts.join(" ")} />
      {curve.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === curve.length - 1 ? 5 : 3} fill={i === curve.length - 1 ? "#e8426a" : "#0b2340"} stroke="#fff" strokeWidth="1.2" />
      ))}
      <text x={x(curve.length - 1) - 8} y={Math.max(T + 10, y(last) - 12)} fontSize="11" fontWeight="700" textAnchor="end" fill="#e8426a" stroke="#fff" strokeWidth="3" paintOrder="stroke">
        ≈{Math.round(last).toLocaleString("en-US")} visits/mo (model)
      </text>
      {curve.map((_, i) =>
        i % 2 === 0 ? (
          <text key={i} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="#8592a3">{i === 0 ? "Now" : `M${i}`}</text>
        ) : null,
      )}
    </svg>
  );
}
