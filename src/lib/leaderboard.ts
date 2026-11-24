// Sales leaderboard rules (docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md Phase 2). Pure and tested.
// The database (0026 sales_leaderboard view) adds up this month's Won value from
// GoHighLevel copies; this only sorts, ranks and labels what it returns. Never invents a number.

export interface BoardRow {
  name: string;
  isMe: boolean;
  /** false = no GoHighLevel user linked yet, so their deals can't be credited. */
  linked: boolean;
  wonUsd: number;
  wonDeals: number;
}

export interface RankedRow extends BoardRow {
  /** 1 = top. People with the same total share a rank. null = not linked (not ranked). */
  rank: number | null;
  /** gold / silver / bronze for the top 3 with something won. */
  medal: "gold" | "silver" | "bronze" | null;
  firstName: string;
  initials: string;
}

export const LEADERBOARD_RULES = {
  /** Most people shown on the card before "+N more". */
  maxShown: 6,
} as const;

const MEDALS = ["gold", "silver", "bronze"] as const;

/** First word of a display name ("(test)"/"(sample)" style notes dropped). */
export function firstName(name: string): string {
  const clean = name.replace(/\([^)]*\)/g, " ").trim();
  return clean.split(/\s+/)[0] || name.trim() || "?";
}

/** Up to two initials for the avatar circle. */
export function initials(name: string): string {
  const words = name.replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1)).map((w) => w?.[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

/** "$43,256": whole dollars, never shortened (the board is about exact totals). */
export function boardUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.max(0, Math.round(amount)));
}

/** Highest total first, then more deals, then name. Linked people get ranks (ties share). */
export function rankBoard(rows: BoardRow[]): RankedRow[] {
  const linked = rows.filter((r) => r.linked).sort((a, b) => b.wonUsd - a.wonUsd || b.wonDeals - a.wonDeals || a.name.localeCompare(b.name));
  const unlinked = rows.filter((r) => !r.linked).sort((a, b) => a.name.localeCompare(b.name));
  let rank = 0;
  let prev: number | null = null;
  const ranked: RankedRow[] = linked.map((r, i) => {
    if (prev === null || r.wonUsd !== prev) rank = i + 1;
    prev = r.wonUsd;
    const medal: RankedRow["medal"] = r.wonUsd > 0 && rank <= 3 ? (MEDALS[rank - 1] ?? null) : null;
    return { ...r, rank, medal, firstName: firstName(r.name), initials: initials(r.name) };
  });
  return [...ranked, ...unlinked.map((r) => ({ ...r, rank: null, medal: null, firstName: firstName(r.name), initials: initials(r.name) }))];
}

/** Shown on the card so everyone knows what the number is. */
export function boardSourceLabel(scope: "sales" | "all"): string {
  return scope === "sales" ? "Won this month · sales pipelines · GoHighLevel" : "Won this month · all pipelines · GoHighLevel";
}
