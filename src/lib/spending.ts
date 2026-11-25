// "Spending & limits" (docs/REVIEW_2026-11.md, item 3): every money cap in Atlas in one place,
// with this month's spending next to it, and plain warnings when caps don't fit together.
// Pure: no network, no database. The screen is SpendingCard on Data Safety (owner + managers).
//
// Two kinds of money:
// - AI (Anthropic): one whole-app monthly budget that every AI helper shares, plus BizToad's
//   own caps inside it. Atlas stops requests itself (src/lib/ai/client.ts + database triggers).
// - DataForSEO lookups: audits (capped by the database, 0023), Scout and SEO Watcher. Scout and
//   Watcher run in Claude Code with the owner's DataForSEO login, so Atlas only records their
//   estimates; the prepaid DataForSEO balance is the real limit for those two.

import { budgetState, type BudgetLevel } from "@/lib/ai/budget";
import { AI_BOTS, isAiFeature } from "@/lib/bot-runs";

export interface SpendingInput {
  ai: { ready: boolean; budgetUsd: number; spentUsd: number; byFeature: Record<string, { requests: number; usd: number }> };
  /** null before 0030. */
  toad: { enabled: boolean; monthlyUsd: number; perPersonUsd: number; spentUsd: number } | null;
  /** DataForSEO caps and this month's recorded spend; null = not set up (migration not run). */
  audits: { monthUsed: number; monthCap: number; weekCap: number } | null;
  scout: { monthUsed: number; monthCap: number; perRepCap: number } | null;
  watcher: { monthUsed: number; monthCap: number } | null;
}

export interface SpendingLine {
  key: "ai" | "toad" | "audits" | "scout" | "watcher";
  label: string;
  usedUsd: number;
  capUsd: number;
  pct: number;
  level: BudgetLevel;
  /** One short line under the bar (e.g. "$5 each"). */
  note: string;
  /** Where the owner changes this cap. */
  href: string;
}

export interface SpendingHelper {
  feature: string;
  label: string;
  requests: number;
  usd: number;
}

export interface SpendingView {
  aiLines: SpendingLine[];
  /** AI helpers used this month, most expensive first. */
  helpers: SpendingHelper[];
  dataLines: SpendingLine[];
  /** DataForSEO caps added up (the most Atlas would let it spend in a month). */
  dataCapUsd: number;
  dataUsedUsd: number;
  /** Things that need the owner's attention, plain English. */
  warnings: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => `$${n < 10 && n % 1 !== 0 ? n.toFixed(2) : Math.round(n).toString()}`;

function line(key: SpendingLine["key"], label: string, used: number, cap: number, note: string, href: string): SpendingLine {
  const b = budgetState(used, cap);
  return { key, label, usedUsd: round2(used), capUsd: round2(cap), pct: b.pct, level: b.level, note, href };
}

export function buildSpending(input: SpendingInput): SpendingView {
  const warnings: string[] = [];
  const aiLines: SpendingLine[] = [];
  if (input.ai.ready) {
    aiLines.push(line("ai", "AI budget (all helpers)", input.ai.spentUsd, input.ai.budgetUsd, "Shared by every AI helper, BizToad and audit writing included.", "/safety#ai"));
  }
  if (input.toad) {
    const t = input.toad;
    aiLines.push(line("toad", "BizToad", t.spentUsd, t.monthlyUsd, t.enabled ? `${money(t.perPersonUsd)} a person, inside the AI budget.` : "Switched off for everyone.", "/safety#ai"));
    if (t.enabled && input.ai.ready && t.monthlyUsd > input.ai.budgetUsd) {
      warnings.push(
        `BizToad's ${money(t.monthlyUsd)} cap can't be reached: the whole AI budget is ${money(input.ai.budgetUsd)}, and every AI helper shares it. Raise the AI budget or lower BizToad's cap so they match.`,
      );
    }
    if (t.enabled && t.perPersonUsd > t.monthlyUsd) {
      warnings.push(`BizToad's per-person cap (${money(t.perPersonUsd)}) is higher than its total (${money(t.monthlyUsd)}), so one person could use all of it.`);
    }
  }

  const helpers: SpendingHelper[] = Object.entries(input.ai.byFeature)
    .map(([feature, v]) => ({ feature, label: isAiFeature(feature) ? AI_BOTS[feature].bot : "Other AI", requests: v.requests, usd: round2(v.usd) }))
    .sort((a, b) => b.usd - a.usd || b.requests - a.requests);

  const dataLines: SpendingLine[] = [];
  if (input.audits) dataLines.push(line("audits", "Audits (Run audit)", input.audits.monthUsed, input.audits.monthCap, `Also ${money(input.audits.weekCap)} a week per person. Enforced by the database.`, "/audits"));
  if (input.scout) dataLines.push(line("scout", "Scout", input.scout.monthUsed, input.scout.monthCap, `${money(input.scout.perRepCap)} a salesperson. Runs in Claude Code: estimates only.`, "/sales/scout"));
  if (input.watcher) dataLines.push(line("watcher", "SEO Watcher", input.watcher.monthUsed, input.watcher.monthCap, "Runs in Claude Code: estimates only.", "/growth/watcher/setup"));

  for (const l of [...aiLines, ...dataLines]) {
    if (l.capUsd <= 0) continue;
    if (l.level === "blocked") warnings.push(`${l.label}: this month's cap is used up (${money(l.usedUsd)} of ${money(l.capUsd)}).`);
    else if (l.level === "warning") warnings.push(`${l.label}: ${l.pct}% of this month's cap is used.`);
  }

  return {
    aiLines,
    helpers,
    dataLines,
    dataCapUsd: round2(dataLines.reduce((n, l) => n + l.capUsd, 0)),
    dataUsedUsd: round2(dataLines.reduce((n, l) => n + l.usedUsd, 0)),
    warnings,
  };
}
