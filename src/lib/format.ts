// Small display helpers. Dates use UTC and a fixed locale so the server and
// the browser always render identical text.

import type { Metric, Money, Unit } from "@/lib/types";

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
    case "ratio":
      return value.toFixed(1);
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

/** "$130k–$150k", "$118,000", or "Unknown". */
export function formatMoney(money: Money): string {
  switch (money.status) {
    case "unknown":
      return "Unknown";
    case "confirmed":
      return formatUsd(money.amountUsd);
    case "estimated":
      return `${formatUsd(money.lowUsd)}–${formatUsd(money.highUsd)}`;
  }
}

/** Whole days from one ISO date to another (negative = in the past). */
export function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10));
  return Math.round(ms / 86_400_000);
}

/** "today", "tomorrow", "in 3 days", "2 days overdue". */
export function describeDue(due: string, today: string): string {
  const d = daysBetween(today, due);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1) return `in ${d} days`;
  return `${-d} day${d === -1 ? "" : "s"} overdue`;
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
