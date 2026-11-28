// "Spending & limits" on Data Safety (docs/REVIEW_2026-11.md, item 3).
import { describe, expect, it } from "vitest";
import { buildSpending, money, type SpendingInput } from "@/lib/spending";
import { AI_BOTS } from "@/lib/bot-runs";

const base: SpendingInput = {
  ai: { ready: true, budgetUsd: 40, spentUsd: 6.5, byFeature: { ask_toad: { requests: 120, usd: 4.2 }, briefing: { requests: 10, usd: 2.3 } } },
  toad: { enabled: true, monthlyUsd: 25, perPersonUsd: 5, spentUsd: 4.2 },
  audits: { monthUsed: 12, monthCap: 50, weekCap: 10 },
  scout: { monthUsed: 3, monthCap: 25, perRepCap: 10 },
  watcher: { monthUsed: 0, monthCap: 20 },
};

describe("buildSpending", () => {
  it("lists every cap with this month's spending, and no warnings when caps fit", () => {
    const v = buildSpending(base);
    expect(v.aiLines.map((l) => l.key)).toEqual(["ai", "toad"]);
    expect(v.dataLines.map((l) => l.key)).toEqual(["audits", "scout", "watcher"]);
    expect(v.dataCapUsd).toBe(95);
    expect(v.dataUsedUsd).toBe(15);
    expect(v.warnings).toEqual([]);
  });

  it("names AI helpers, most expensive first", () => {
    const v = buildSpending(base);
    expect(v.helpers).toEqual([
      { feature: "ask_toad", label: "BizToad", requests: 120, usd: 4.2 },
      { feature: "briefing", label: "Ops Briefing", requests: 10, usd: 2.3 },
    ]);
  });

  it("names the Run audit helper (it was missing from the bot list)", () => {
    expect(AI_BOTS.audit_words.bot).toBe("Audit Writer");
    const v = buildSpending({ ...base, ai: { ...base.ai, byFeature: { audit_words: { requests: 2, usd: 0.4 } } } });
    expect(v.helpers[0]?.label).toBe("Audit Writer");
  });

  it("warns when BizToad's cap is bigger than the whole AI budget (the default $25 vs $10)", () => {
    const v = buildSpending({ ...base, ai: { ...base.ai, budgetUsd: 10 } });
    expect(v.warnings.join(" ")).toContain("BizToad's $25 cap can't be reached");
  });

  it("doesn't warn about BizToad's cap when BizToad is off", () => {
    const v = buildSpending({ ...base, ai: { ...base.ai, budgetUsd: 10 }, toad: { ...base.toad!, enabled: false } });
    expect(v.warnings.some((w) => w.includes("BizToad"))).toBe(false);
  });

  it("warns when one person's BizToad cap is above the total", () => {
    const v = buildSpending({ ...base, toad: { ...base.toad!, perPersonUsd: 30 } });
    expect(v.warnings.join(" ")).toContain("per-person cap ($30) is higher than its total ($25)");
  });

  it("warns at 80% and when a cap is used up", () => {
    const v = buildSpending({ ...base, audits: { monthUsed: 50, monthCap: 50, weekCap: 10 }, scout: { monthUsed: 21, monthCap: 25, perRepCap: 10 } });
    expect(v.warnings).toContain("Audits (Run audit): this month's cap is used up ($50 of $50).");
    expect(v.warnings).toContain("Scout: 84% of this month's cap is used.");
  });

  it("leaves out what isn't set up yet", () => {
    const v = buildSpending({ ai: { ready: false, budgetUsd: 10, spentUsd: 0, byFeature: {} }, toad: null, audits: null, scout: null, watcher: null });
    expect(v.aiLines).toEqual([]);
    expect(v.dataLines).toEqual([]);
    expect(v.warnings).toEqual([]);
  });
});

describe("money", () => {
  it("shows cents only for small amounts that have them", () => {
    expect(money(25)).toBe("$25");
    expect(money(4.2)).toBe("$4.20");
    expect(money(12.4)).toBe("$12");
  });
});
