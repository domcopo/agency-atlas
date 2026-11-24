// Sales leaderboard (docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md Phase 2). Computers: a slim card
// at the top right of Sales. Phones: a row of small chips under the title. Numbers come only
// from the 0026 view (Won value this month in GoHighLevel); names are shown as plain text.

import { Trophy } from "lucide-react";
import { Pill } from "@/components/labels/labels";
import { getLeaderboard } from "@/lib/data-source";
import { cn } from "@/lib/format";
import { boardSourceLabel, boardUsd, LEADERBOARD_RULES, rankBoard, type RankedRow } from "@/lib/leaderboard";

const medalRing = { gold: "ring-amber text-amber", silver: "ring-muted text-ink", bronze: "ring-due-orange text-due-orange" } as const;

function Avatar({ row, size = "md" }: { row: RankedRow; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-white/10 font-bold",
        size === "sm" ? "size-7 text-[10.5px]" : "size-8 text-[11px]",
        row.medal ? `ring-2 ${medalRing[row.medal]}` : "text-muted",
        row.isMe && !row.medal && "ring-2 ring-violet",
      )}
    >
      {row.initials}
    </span>
  );
}

function amount(row: RankedRow) {
  return row.linked ? boardUsd(row.wonUsd) : "not linked";
}

export async function SalesLeaderboard({ variant, owner }: { variant: "card" | "chips"; owner: boolean }) {
  const board = await getLeaderboard();
  if (!board.ready) {
    if (!owner) return null;
    return variant === "card" ? (
      <p className="hidden max-w-72 rounded-2xl border border-line px-3 py-2 text-[11px] text-faint lg:block">Leaderboard needs one setup step first (0026 SQL).</p>
    ) : null;
  }
  const rows = rankBoard(board.rows);
  if (!rows.length) return null;
  const shown = rows.slice(0, LEADERBOARD_RULES.maxShown);
  const more = rows.length - shown.length;
  const label = boardSourceLabel(board.scope);

  if (variant === "chips") {
    return (
      <section aria-label="Sales leaderboard" className="glass -mt-2 mb-4 rounded-3xl px-3 py-2.5 lg:hidden">
        <p className="flex items-center gap-1.5 px-1 text-xs font-semibold">
          <Trophy aria-hidden className="size-3.5 text-amber" /> Leaderboard
          {board.sample && <Pill className="ml-auto">Sample data</Pill>}
        </p>
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className={cn("flex shrink-0 items-center gap-2 rounded-2xl border px-2.5 py-1.5", r.isMe ? "border-violet/50 bg-violet/10" : "border-line")}>
              <Avatar row={r} size="sm" />
              <span className="leading-tight">
                <span className="block text-[12px] font-semibold">
                  {r.rank ? `${r.rank}. ` : ""}
                  {r.firstName}
                </span>
                <span className={cn("block text-[11px]", r.linked ? "text-muted" : "text-faint")}>{amount(r)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="px-1 text-[10.5px] text-faint">{label}</p>
      </section>
    );
  }

  return (
    <section aria-label="Sales leaderboard" className="glass hidden w-80 shrink-0 rounded-3xl px-4 py-3 lg:block">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Trophy aria-hidden className="size-4 text-amber" /> Leaderboard
        {board.sample && <Pill className="ml-auto">Sample data</Pill>}
      </p>
      <ol className="mt-2 space-y-1.5">
        {shown.map((r, i) => (
          <li key={`${r.name}-${i}`} className={cn("flex items-center gap-2.5 rounded-xl px-1.5 py-1", r.isMe && "bg-violet/10")}>
            <span className="w-4 text-right text-[11px] font-semibold text-faint">{r.rank ?? "–"}</span>
            <Avatar row={r} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {r.firstName}
              {r.isMe && <span className="ml-1 text-[11px] font-normal text-faint">(you)</span>}
            </span>
            <span className={cn("text-sm tabular-nums", r.linked ? "font-semibold" : "text-[11px] text-faint")}>{amount(r)}</span>
          </li>
        ))}
      </ol>
      {more > 0 && <p className="mt-1 text-[11px] text-faint">+{more} more</p>}
      <p className="mt-1.5 text-[10.5px] text-faint">{label}</p>
    </section>
  );
}
