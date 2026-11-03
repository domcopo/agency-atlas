// Small display helpers. Dates use UTC and a fixed locale so the server and
// the browser always render identical text.

import type { Metric, Unit } from "@/lib/types";

/** Joins class names, skipping empty ones. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: amount >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: amount >= 10_000 ? 1 : 0,
  }).format(amount);
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

export function formatValue(value: number, unit: Unit): string {
  switch (unit) {
    case "percent":
      return `${value}%`;
    case "usd":
      return formatUsd(value);
    case "minutes":
      return formatMinutes(value);
    case "count":
      return new Intl.NumberFormat("en-US").format(value);
  }
}

/** Change vs the previous period, and whether that change is good news. */
export function describeChange(metric: Pick<Metric, "value" | "previous" | "unit" | "betterWhen">) {
  const diff = metric.value - metric.previous;
  const direction: "up" | "down" | "flat" = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const isGood =
    direction === "flat" ? null : (direction === "up") === (metric.betterWhen === "higher");
  let text: string;
  if (metric.unit === "percent") {
    text = `${Math.abs(diff)} pts`;
  } else if (metric.previous === 0) {
    text = formatValue(Math.abs(diff), metric.unit);
  } else {
    text = `${Math.round((Math.abs(diff) / metric.previous) * 100)}%`;
  }
  return { direction, isGood, text };
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function formatDexNumber(n: number): string {
  return `#${String(n).padStart(3, "0")}`;
}

export function initials(name: string): string {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
