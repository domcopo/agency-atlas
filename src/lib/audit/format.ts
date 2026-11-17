// Display helpers for the audit pages. A null always prints as "not found".

import { roundMoney } from "./compute";

export const NOT_FOUND = "not found";

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NOT_FOUND;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtUsd(v: number | null | undefined, opts: { exact?: boolean; cents?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NOT_FOUND;
  if (opts.cents) return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const r = opts.exact ? Math.round(v) : roundMoney(v);
  return `${r < 0 ? "-" : ""}$${Math.abs(r).toLocaleString("en-US")}`;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NOT_FOUND;
  return `${(v * 100).toFixed(digits)}%`;
}

/** "2026-11-17" → "Nov 17, 2026" (no time zone surprises: parsed as plain parts). */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${months[m - 1]} ${d}, ${y}`;
}
