// Bot runs (0018, docs/BOT_RUNS_PLAN.md): the owner summary's "recent_runs" list, built
// from the AI cost log. Pure functions: no database, no network.
//
// Privacy rule: every word in a run (bot name, action) comes from the FIXED table below,
// chosen by the log's feature code. Nothing typed by a person or written by the AI ever
// reaches this list: the cost log doesn't store prompts or answers, and this code only
// reads the columns listed in RunLogRow.

/** Every AI feature Atlas has, with the fixed words shown for it. */
export const AI_BOTS = {
  briefing: { bot: "Ops Briefing", action: "built daily plan" },
  client_profile: { bot: "Client Profile", action: "wrote client profile" },
  work_orders: { bot: "Work Order Drafts", action: "drafted work orders" },
  quick_add: { bot: "Smart Add", action: "drafted work orders from a note" },
  work_prompt: { bot: "Work Prompt Helper", action: "wrote a work prompt" },
} as const;

export type AiFeature = keyof typeof AI_BOTS;

export function isAiFeature(f: unknown): f is AiFeature {
  return typeof f === "string" && Object.prototype.hasOwnProperty.call(AI_BOTS, f);
}

export const RECENT_RUNS_MAX = 100;
export const RECENT_RUNS_DAYS = 7;

/** One line of the cost log, as read for this list (only these columns). */
export interface RunLogRow {
  run_ref: string;
  feature: string;
  created_at: string;
  started_at: string | null;
  cost_usd: number | string | null;
  outcome: string;
}

export interface SummaryRun {
  run_id: string;
  parent_run_id: null;
  bot: string;
  action: string;
  started_at: string;
  finished_at: string | null;
  result: "ok" | "error" | "running";
  cost_usd: number | null;
}

const RUN_REF = /^[0-9a-f]{12}$/;

/**
 * The last 100 runs of the past 7 days, newest first. Unknown features and malformed
 * lines are skipped. A missing cost stays null (never 0). Runs are logged when they
 * finish, so "running" never appears; no bot hands work to another, so no parent.
 */
export function buildRecentRuns(rows: RunLogRow[], now: Date): SummaryRun[] {
  const cutoff = now.getTime() - RECENT_RUNS_DAYS * 86_400_000;
  const out: { at: number; run: SummaryRun }[] = [];
  for (const r of rows) {
    if (!isAiFeature(r.feature) || !RUN_REF.test(r.run_ref)) continue;
    const finished = Date.parse(r.created_at);
    if (!Number.isFinite(finished) || finished < cutoff || finished > now.getTime() + 60_000) continue;
    const started = r.started_at ? Date.parse(r.started_at) : NaN;
    const cost = r.cost_usd === null || r.cost_usd === "" ? null : Number(r.cost_usd);
    const words = AI_BOTS[r.feature];
    out.push({
      at: finished,
      run: {
        run_id: r.run_ref,
        parent_run_id: null,
        bot: words.bot,
        action: words.action,
        // Runs from before 0018 have no start time: the finish time stands in.
        started_at: new Date(Number.isFinite(started) ? started : finished).toISOString(),
        finished_at: new Date(finished).toISOString(),
        result: r.outcome === "ok" ? "ok" : "error",
        cost_usd: cost === null || !Number.isFinite(cost) ? null : Math.round(cost * 10_000) / 10_000,
      },
    });
  }
  return out
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_RUNS_MAX)
    .map((x) => x.run);
}
