// Tiny hand-drawn SVG charts — no chart library needed.

import { useId } from "react";
import type { HealthStatus } from "@/lib/types";

/** A small trend line. Decorative: the number next to it carries the meaning. */
export function Sparkline({
  values,
  color = "var(--color-violet)",
  width = 96,
  height = 32,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const id = useId();
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 3;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const last = points[points.length - 1]!;

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

export const healthColor: Record<HealthStatus, string> = {
  thriving: "var(--color-lime)",
  steady: "var(--color-sky)",
  at_risk: "var(--color-rose)",
};

export const healthLabel: Record<HealthStatus, string> = {
  thriving: "Thriving",
  steady: "Steady",
  at_risk: "At risk",
};

/** Circular 0–100 health score. */
export function HealthRing({
  score,
  status,
  size = 56,
}: {
  score: number;
  status: HealthStatus;
  size?: number;
}) {
  const stroke = size >= 80 ? 7 : 5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);
  const color = healthColor[status];

  return (
    <div
      role="img"
      aria-label={`Health score ${score} out of 100, ${healthLabel[status]}`}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(255 255 255 / 0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center font-display font-bold"
        style={{ fontSize: size * 0.3 }}
      >
        {score}
      </span>
    </div>
  );
}
