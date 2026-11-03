"use client";

// Sales page: switch between clients won, clients lost, and the net change per
// month. Numbers are worked out on the server and passed in; this only switches
// the view.

import { useState } from "react";
import { cn, formatUsdExact } from "@/lib/format";

export interface WinLossMonthView {
  month: string;
  label: string;
  won: number;
  wonMrr: number;
  lost: number;
  lostMrr: number;
}

type View = "won" | "lost" | "net";

const views: { id: View; label: string }[] = [
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "net", label: "Net" },
];

export function WinLossChart({
  months,
  lostWithoutDate,
  hasRealData,
}: {
  months: WinLossMonthView[];
  lostWithoutDate: number;
  hasRealData: boolean;
}) {
  const [view, setView] = useState<View>("won");
  const value = (m: WinLossMonthView) => (view === "won" ? m.won : view === "lost" ? m.lost : m.won - m.lost);
  const max = Math.max(1, ...months.map((m) => Math.abs(value(m))));
  const last = months[months.length - 2]; // last full month
  const sum = (f: (m: WinLossMonthView) => number) => months.reduce((n, m) => n + f(m), 0);

  return (
    <div>
      <div role="radiogroup" aria-label="Chart view" className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.05] p-1">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={view === v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "pressable min-h-9 rounded-xl text-xs font-semibold",
              view === v.id
                ? v.id === "lost"
                  ? "bg-rose/20 text-rose"
                  : v.id === "won"
                    ? "bg-lime/15 text-lime"
                    : "bg-violet/20 text-violet"
                : "text-muted",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div
        className="relative flex h-36 items-stretch gap-2"
        role="img"
        aria-label={`Clients ${view} per month: ${months.map((m) => `${m.label} ${value(m)}`).join(", ")}`}
      >
        {months.map((m) => {
          const v = value(m);
          const h = Math.max(v === 0 ? 2 : 4, (Math.abs(v) / max) * (view === "net" ? 44 : 88));
          const color = view === "won" || (view === "net" && v >= 0) ? "from-lime/40 to-lime" : "from-rose/40 to-rose";
          return (
            <div key={m.month} className="flex flex-1 flex-col items-center">
              {view === "net" ? (
                <div className="flex w-full flex-1 flex-col">
                  <div className="flex flex-1 flex-col items-center justify-end">
                    {v >= 0 && <span className="text-xs font-semibold">{v > 0 ? `+${v}` : v}</span>}
                    {v > 0 && <div className={cn("w-full rounded-t-lg bg-gradient-to-t", color)} style={{ height: h }} />}
                  </div>
                  <div className="h-px w-full bg-line" />
                  <div className="flex flex-1 flex-col items-center">
                    {v < 0 && <div className={cn("w-full rounded-b-lg bg-gradient-to-b", color)} style={{ height: h }} />}
                    {v < 0 && <span className="text-xs font-semibold text-rose">{v}</span>}
                  </div>
                </div>
              ) : (
                <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-xs font-semibold">{v}</span>
                  <div className={cn("w-full rounded-t-lg bg-gradient-to-t", color)} style={{ height: h }} />
                </div>
              )}
              <span className="mt-1 text-[10px] text-muted">{m.label}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
        {view === "won" && last && (
          <>
            {last.label}: <span className="font-semibold text-ink">{last.won} won</span>, adding{" "}
            <span className="font-semibold text-ink">{formatUsdExact(last.wonMrr)}/mo</span>. Counted by start date.
          </>
        )}
        {view === "lost" && (
          <>
            <span className="font-semibold text-ink">{sum((m) => m.lost)} lost</span> in these 6 months (
            {formatUsdExact(Math.round(sum((m) => m.lostMrr) * 100) / 100)}/mo). Counted by cancel date.
          </>
        )}
        {view === "net" && (
          <>
            Net over 6 months: <span className="font-semibold text-ink">{sum(value) >= 0 ? "+" : ""}{sum(value)} clients</span>.
            Won minus lost each month.
          </>
        )}
      </p>
      {view !== "won" && lostWithoutDate > 0 && (
        <p className="mt-1.5 rounded-xl bg-amber/10 px-2.5 py-2 text-[11px] text-amber">
          {lostWithoutDate} lost {lostWithoutDate === 1 ? "client has" : "clients have"} no cancel date yet, so{" "}
          {lostWithoutDate === 1 ? "it isn't" : "they aren't"} in these bars.
          {hasRealData ? " Send Claude the dates to fill this in." : ""}
        </p>
      )}
    </div>
  );
}
