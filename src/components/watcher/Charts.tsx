// SEO Watcher charts: hand-drawn SVG, no chart package. Labels are plain HTML around the
// SVG so text never stretches. Colors come from the theme (currentColor), so light and
// dark both work. No animation, so nothing moves for people who prefer reduced motion.

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/format";
import type { Trend } from "@/lib/watch/compute";

function pathFor(values: (number | null)[], w: number, h: number, pad = 2, invert = false) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return { line: "", area: "", last: null as [number, number] | null };
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const y = (v: number) => {
    const t = (v - min) / span;
    return pad + (invert ? t : 1 - t) * (h - pad * 2);
  };
  let line = "";
  let firstX: number | null = null;
  let lastPt: [number, number] | null = null;
  values.forEach((v, i) => {
    if (v === null) return;
    const x = pad + i * step;
    const yy = y(v);
    line += `${line === "" || lastPt === null ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)} `;
    if (firstX === null) firstX = x;
    lastPt = [x, yy];
  });
  const area = lastPt && firstX !== null ? `${line}L${(lastPt as [number, number])[0].toFixed(1)},${h} L${(firstX as number).toFixed(1)},${h} Z` : "";
  return { line: line.trim(), area, last: lastPt };
}

/** Big line chart with a soft fill, for visibility and the agency index. */
export function LineChart({
  values,
  startLabel,
  endLabel,
  label,
  tone = "text-violet",
  height = 140,
}: {
  values: (number | null)[];
  startLabel?: string;
  endLabel?: string;
  /** Read aloud by screen readers: what the line shows and where it ends. */
  label: string;
  tone?: string;
  height?: number;
}) {
  const W = 600;
  const fillId = `watch-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { line, area, last } = pathFor(values, W, height, 6);
  return (
    <figure className={cn("m-0", tone)}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className="block h-36 w-full lg:h-44">
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={height * f} y2={height * f} stroke="currentColor" strokeOpacity="0.08" vectorEffect="non-scaling-stroke" />
        ))}
        {area && <path d={area} fill={`url(#${fillId})`} />}
        {line && <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {last && <circle cx={last[0]} cy={last[1]} r="4" fill="currentColor" vectorEffect="non-scaling-stroke" />}
      </svg>
      {(startLabel || endLabel) && (
        <figcaption className="mt-1 flex justify-between text-[11px] text-faint">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </figcaption>
      )}
    </figure>
  );
}

/** Small line for a row. `invert` draws smaller numbers higher (for rank positions). */
export function Sparkline({ values, tone, invert = false, label }: { values: (number | null)[]; tone: string; invert?: boolean; label: string }) {
  const W = 80;
  const H = 24;
  const { line, last } = pathFor(values, W, H, 2, invert);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className={cn("h-6 w-20 shrink-0", tone)}>
      {line && <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />}
      {last && <circle cx={last[0]} cy={last[1]} r="2" fill="currentColor" />}
    </svg>
  );
}

/** Monthly bars (search volume). */
export function Bars({ values, label }: { values: (number | null)[]; label: string }) {
  const known = values.filter((v): v is number => v !== null);
  const max = Math.max(1, ...known);
  return (
    <div role="img" aria-label={label} className="flex h-6 w-24 shrink-0 items-end gap-[2px]">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-sm", v === null ? "bg-line" : i === values.length - 1 ? "bg-sky" : "bg-sky/40")}
          style={{ height: `${v === null ? 8 : Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** ▲ / ▼ percent change chip. Higher = better unless `lowerIsBetter`. */
export function Change({ pct, suffix = "%", className }: { pct: number | null; suffix?: string; className?: string }) {
  if (pct === null) return <span className={cn("text-xs text-faint", className)}>no change yet</span>;
  const up = pct > 0;
  const flat = pct === 0;
  const Icon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums", flat ? "text-muted" : up ? "text-teal" : "text-rose", className)}>
      <Icon aria-hidden className="size-3.5" />
      <span className="sr-only">{flat ? "no change" : up ? "up" : "down"} </span>
      {up ? "+" : ""}
      {Math.round(pct * 10) / 10}
      {suffix}
    </span>
  );
}

/** Rank position change: moving from 14 to 4 is "+10" (better). */
export function PositionChange({ from, to }: { from: number | null; to: number | null }) {
  if (from === null && to === null) return <span className="text-xs text-faint">not in top 30</span>;
  if (from === null) return <span className="text-xs font-semibold text-teal">new in top 30</span>;
  if (to === null) return <span className="text-xs font-semibold text-rose">left top 30</span>;
  return <Change pct={from - to} suffix="" />;
}

export function trendWord(t: Trend): { text: string; tone: string } {
  switch (t.direction) {
    case "rising":
      return { text: "Rising", tone: "text-teal" };
    case "falling":
      return { text: "Falling", tone: "text-rose" };
    case "flat":
      return { text: "Steady", tone: "text-muted" };
    default:
      return { text: "Not enough checks", tone: "text-faint" };
  }
}

/** "#4" or "—" (not in the top 30). */
export function pos(p: number | null): string {
  return p === null ? ">30" : `#${p}`;
}

export function packText(p: number | null): string {
  return p === null ? "not checked" : p === 0 ? "not in top 3" : `Maps #${p}`;
}
