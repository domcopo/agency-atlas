// Prices and budget math for the AI. Pure functions, no network, easy to test.
//
// Prices are Anthropic's published API rates in US dollars per million tokens
// (a token is a word-piece; 1 million tokens ≈ 750,000 words). Checked 2026-11-04.
// If Anthropic changes prices, update this table; the meter uses it for every request.

export const AI_MODEL = "claude-opus-5-5";

export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Exact cost of one request from the token counts the API reports. */
export function costOf(model: string, u: TokenUsage): number {
  const p = PRICES[model];
  if (!p) throw new Error(`No price known for ${model}; refusing to guess.`);
  const usd =
    (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite) / 1_000_000;
  return Math.round(usd * 10_000) / 10_000;
}

/**
 * The most one request could cost: a generous guess at the input (about 3 characters
 * per token) plus the full output allowance. Used to refuse a request that could
 * push the month past the budget.
 */
export function worstCaseCost(model: string, inputChars: number, maxOutputTokens: number): number {
  return costOf(model, { inputTokens: Math.ceil(inputChars / 3), outputTokens: maxOutputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 });
}

export type BudgetLevel = "ok" | "notice" | "warning" | "blocked";

/** 50% = notice (amber), 80% = warning (red banner), 100% = blocked (no new requests). */
export function budgetState(spentUsd: number, budgetUsd: number): { pct: number; level: BudgetLevel; remaining: number } {
  const remaining = Math.max(0, Math.round((budgetUsd - spentUsd) * 10_000) / 10_000);
  if (budgetUsd <= 0) return { pct: 100, level: "blocked", remaining: 0 };
  const pct = Math.min(100, Math.round((spentUsd / budgetUsd) * 100));
  const level: BudgetLevel = spentUsd >= budgetUsd ? "blocked" : pct >= 80 ? "warning" : pct >= 50 ? "notice" : "ok";
  return { pct, level, remaining };
}

/** Start of the current month (this Mac's local time), as an ISO timestamp. */
export function monthStartIso(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
