// SEO Watcher (docs/SEO_WATCHER_PLAN.md): the math and the fictional sample.

import { describe, expect, it } from "vitest";
import {
  checkDates,
  competitorRisers,
  ctrFor,
  movers,
  opportunityScore,
  packCtrFor,
  pctChange,
  positionGain,
  roomNotice,
  roundCostUsd,
  seasonality,
  shiftMonth,
  spotTrends,
  toIndex,
  trendOf,
  UPSELL_RULES,
  upsellDue,
  upsellFacts,
  visibilitySeries,
  visitsFor,
  volumeAt,
  volumeChange,
  WATCH_RULES,
  type OpportunityInput,
  type RankCheck,
  type WatchClient,
  type WatchData,
} from "@/lib/watch/compute";
import { WATCH_SAMPLE_TODAY, watchSample, watchSampleOpportunities } from "@/fixtures/watch-sample";

const check = (keywordId: string, date: string, organic: number | null, pack: number | null = 0, others: RankCheck["others"] = []): RankCheck => ({
  keywordId,
  marketId: "m1",
  date,
  organic,
  pack,
  others,
  source: "sample",
});

function tiny(checks: RankCheck[], volumes: Record<string, number | null> = { busy: 1000, quiet: 20 }): WatchData {
  return {
    clients: [client({ id: "c1", domain: "ours.example" })],
    markets: [{ id: "m1", clientId: "c1", city: "Town", state: "OH", lat: 40, lng: -82 }],
    keywords: [
      { id: "busy", clientId: "c1", keyword: "busy", money: true },
      { id: "quiet", clientId: "c1", keyword: "quiet", money: false },
    ],
    checks,
    volumes: Object.entries(volumes).map(([keyword, volume]) => ({ keyword, marketId: "m1", month: "2026-01", volume, source: "sample" as const })),
    competitors: [],
  };
}

function client(over: Partial<WatchClient> = {}): WatchClient {
  return {
    id: "c1",
    name: "Test (fictional)",
    domain: "test.example",
    niche: "Plumbing",
    services: ["Local SEO"],
    nextServices: ["Google Ads management"],
    startedOn: "2026-01-01",
    health: "good",
    openComplaint: false,
    lastMood: "positive",
    lastUpsellSentOn: null,
    ...over,
  };
}

describe("click model", () => {
  it("gives the most clicks to #1, less further down, none past the checked depth", () => {
    expect(ctrFor(1)).toBeGreaterThan(ctrFor(2));
    expect(ctrFor(10)).toBeGreaterThan(ctrFor(11));
    expect(ctrFor(15)).toBe(WATCH_RULES.ctrPage2);
    expect(ctrFor(25)).toBe(WATCH_RULES.ctrPage3);
    expect(ctrFor(31)).toBe(0);
    expect(ctrFor(null)).toBe(0);
    expect(ctrFor(0)).toBe(0);
    expect(packCtrFor(0)).toBe(0);
    expect(packCtrFor(null)).toBe(0);
    expect(packCtrFor(1)).toBeGreaterThan(packCtrFor(3));
  });

  it("never guesses visits when the search volume wasn't found, and caps one keyword's share", () => {
    expect(visitsFor(null, 1, 1)).toBeNull();
    expect(visitsFor(1000, null, 0)).toBe(0);
    expect(visitsFor(1000, 1, 1)).toBeCloseTo(1000 * (0.28 + 0.16));
    expect(visitsFor(100, 1, 1)! / 100).toBeLessThanOrEqual(WATCH_RULES.maxShare);
  });

  it("counts 'not in the top 30' as position 31 for gains", () => {
    expect(positionGain(null, 5)).toBe(26);
    expect(positionGain(5, null)).toBe(-26);
    expect(positionGain(null, null)).toBe(0);
    expect(positionGain(10, 4)).toBe(6);
  });
});

describe("visibility over time", () => {
  it("adds up modeled visits per check date and counts missing volumes instead of guessing", () => {
    const data = tiny([check("busy", "2026-01-05", 1), check("quiet", "2026-01-05", 1), check("busy", "2026-01-12", 2)], { busy: 1000, quiet: null });
    const s = visibilitySeries(data, "c1");
    expect(s.map((p) => p.date)).toEqual(["2026-01-05", "2026-01-12"]);
    expect(s[0]!.visits).toBeCloseTo(280);
    expect(s[0]!.volumeMissing).toBe(1);
    expect(s[1]!.visits).toBeCloseTo(150);
  });

  it("uses the latest search volume at or before the check, never a later one", () => {
    const volumes = [
      { keyword: "k", marketId: "m1", month: "2026-01", volume: 100, source: "sample" as const },
      { keyword: "k", marketId: "m1", month: "2026-03", volume: 300, source: "sample" as const },
    ];
    expect(volumeAt(volumes, "k", "m1", "2026-02-15")).toBe(100);
    expect(volumeAt(volumes, "k", "m1", "2026-03-01")).toBe(300);
    expect(volumeAt(volumes, "k", "m1", "2025-12-31")).toBeNull();
    expect(volumeAt(volumes, "k", "other", "2026-03-01")).toBeNull();
  });

  it("an index starts at 100 on the first value above zero", () => {
    expect(toIndex([0, 50, 75, 100])).toEqual([null, 100, 150, 200]);
    expect(toIndex([0, 0])).toEqual([null, null]);
    expect(toIndex([])).toEqual([]);
  });

  it("percent change refuses to divide by zero or missing values", () => {
    expect(pctChange(100, 125)).toBe(25);
    expect(pctChange(0, 10)).toBeNull();
    expect(pctChange(null, 10)).toBeNull();
    expect(pctChange(10, undefined)).toBeNull();
  });
});

describe("trends", () => {
  it("needs enough checks before calling a trend", () => {
    expect(trendOf([1, 2, 3]).direction).toBe("not_enough_data");
    expect(trendOf([1, null, 2, null, 3]).direction).toBe("not_enough_data");
    expect(trendOf([]).points).toBe(0);
  });

  it("spots rising, falling and flat lines, with the streak at the end", () => {
    const up = trendOf([10, 11, 12, 13, 14, 15]);
    expect(up.direction).toBe("rising");
    expect(up.streak).toBe(5);
    const down = trendOf([20, 18, 19, 15, 12, 10]);
    expect(down.direction).toBe("falling");
    expect(down.streak).toBe(3);
    expect(trendOf([100, 100.2, 99.9, 100.1, 100]).direction).toBe("flat");
    expect(trendOf([0, 0, 0, 0]).direction).toBe("flat");
  });
});

describe("movers", () => {
  it("weights by search volume: a big move on a quiet keyword ranks below a smaller move on a busy one", () => {
    const data = tiny([
      check("busy", "2026-01-05", 14),
      check("quiet", "2026-01-05", 30),
      check("busy", "2026-01-12", 4),
      check("quiet", "2026-01-12", 3),
    ]);
    const { up, down } = movers(data, "2026-01-05", "2026-01-12");
    expect(up.map((m) => m.keyword)).toEqual(["busy", "quiet"]);
    expect(up[0]!.gain).toBe(10);
    expect(up[0]!.visitsChange).toBeGreaterThan(up[1]!.visitsChange!);
    expect(down).toEqual([]);
  });

  it("lists drops (including falling out of the top 30) and skips unchanged keywords", () => {
    const data = tiny([check("busy", "d1", 3), check("quiet", "d1", 5), check("busy", "d2", null), check("quiet", "d2", 5)]);
    const { up, down } = movers(data, "d1", "d2");
    expect(up).toEqual([]);
    expect(down).toHaveLength(1);
    expect(down[0]!.to).toBeNull();
    expect(down[0]!.gain).toBe(-28);
  });

  it("puts keywords without a search volume after the ones with one", () => {
    const data = tiny([check("busy", "d1", 10), check("quiet", "d1", 30), check("busy", "d2", 9), check("quiet", "d2", 1)], { busy: 1000, quiet: null });
    const { up } = movers(data, "d1", "d2");
    expect(up.map((m) => m.keyword)).toEqual(["busy", "quiet"]);
    expect(up[1]!.visitsChange).toBeNull();
  });
});

describe("competitors on the rise", () => {
  it("ranks other sites by modeled visits gained on our keywords and never lists our own clients", () => {
    const data = tiny([
      check("busy", "d1", 2, 0, [{ domain: "riser.example", position: 15 }, { domain: "ours.example", position: 9 }, { domain: "faller.example", position: 1 }]),
      check("busy", "d2", 3, 0, [{ domain: "riser.example", position: 1 }, { domain: "ours.example", position: 2 }, { domain: "faller.example", position: 6 }]),
    ]);
    const r = competitorRisers(data, "d1", "d2");
    expect(r.map((x) => x.domain)).toEqual(["riser.example"]);
    expect(r[0]!.clientIds).toEqual(["c1"]);
    expect(r[0]!.gains).toBe(1);
  });
});

describe("search demand", () => {
  it("works out month-over-month and year-over-year change", () => {
    const vols = [
      { keyword: "k", marketId: "m", month: "2025-11", volume: 100, source: "sample" as const },
      { keyword: "k", marketId: "m", month: "2026-10", volume: 120, source: "sample" as const },
      { keyword: "k", marketId: "m", month: "2026-11", volume: 150, source: "sample" as const },
    ];
    expect(volumeChange(vols, "k", "m")).toEqual({ latest: 150, month: "2026-11", momPct: 25, yoyPct: 50 });
    expect(volumeChange(vols, "nope", "m").latest).toBeNull();
  });

  it("shifts months across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", -12)).toBe("2025-11");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("finds busy and quiet months, and leaves months without data empty", () => {
    const vols = [
      { keyword: "k", marketId: "m", month: "2026-01", volume: 50, source: "sample" as const },
      { keyword: "k", marketId: "m", month: "2026-06", volume: 150, source: "sample" as const },
      { keyword: "k", marketId: "m", month: "2026-07", volume: null, source: "sample" as const },
    ];
    const s = seasonality(vols);
    expect(s[0]).toBe(0.5);
    expect(s[5]).toBe(1.5);
    expect(s[6]).toBeNull();
    expect(seasonality([]).every((v) => v === null)).toBe(true);
  });
});

describe("opportunity markets", () => {
  const easy: OpportunityInput = { demand: 2000, packReviewsAvg: 10, packNoWebsite: 3, difficulty: 0, milesFromBase: 5, nearbyClients: 2, conflict: false };

  it("scores an easy, busy, nearby market at 100 and a hard, far one low", () => {
    expect(opportunityScore(easy).score).toBe(100);
    const hard = opportunityScore({ demand: 10, packReviewsAvg: 400, packNoWebsite: 0, difficulty: 90, milesFromBase: 200, nearbyClients: 0, conflict: false });
    expect(hard.score).toBeLessThan(15);
  });

  it("never pitches against a client of ours in the same niche and market", () => {
    const r = opportunityScore({ ...easy, conflict: true });
    expect(r.score).toBe(0);
    expect(r.blocked).toBe(true);
  });

  it("scores missing figures as 0 and lists them, instead of guessing", () => {
    const r = opportunityScore({ ...easy, difficulty: null, milesFromBase: null });
    expect(r.missing).toEqual(["keyword difficulty", "distance"]);
    expect(r.score).toBe(70);
  });

  it("gives plain reasons and stays between 0 and 100", () => {
    const r = opportunityScore({ ...easy, packNoWebsite: 9, nearbyClients: 7 });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.reasons.join(" · ")).toContain("3 of the Maps top 3 have no real website");
    expect(opportunityScore({ ...easy, demand: -5 }).score).toBeGreaterThanOrEqual(0);
  });
});

describe("upsell: only when it's that client's time", () => {
  const earned = { newTop3Money: 3, visibilityChange3mPct: 5, top3SharePct: 10 };
  const today = "2026-11-23";

  it("is due when every check passes, and offers one specific next step", () => {
    const d = upsellDue(client({ startedOn: "2026-06-01" }), earned, today);
    expect(d.due).toBe(true);
    expect(d.idea).toBe("Google Ads management");
    expect(d.checks).toHaveLength(5);
  });

  it("waits until the client has been with us long enough", () => {
    expect(upsellDue(client({ startedOn: "2026-09-01" }), earned, today).due).toBe(false);
    expect(upsellDue(client({ startedOn: "2026-08-23" }), earned, today).due).toBe(true);
    expect(upsellDue(client({ startedOn: "2026-08-24" }), earned, today).due).toBe(false);
  });

  it(`leaves ${UPSELL_RULES.gapDays} days between upsells`, () => {
    expect(upsellDue(client({ lastUpsellSentOn: "2026-10-01" }), earned, today).due).toBe(false);
    expect(upsellDue(client({ lastUpsellSentOn: "2026-08-25" }), earned, today).due).toBe(true);
  });

  it("never upsells an unhappy client", () => {
    expect(upsellDue(client({ health: "at_risk" }), earned, today).due).toBe(false);
    expect(upsellDue(client({ openComplaint: true }), earned, today).due).toBe(false);
    expect(upsellDue(client({ lastMood: "negative" }), earned, today).due).toBe(false);
  });

  it("needs clearly better rankings (any one of the three signals)", () => {
    const none = { newTop3Money: 2, visibilityChange3mPct: 19, top3SharePct: 59 };
    expect(upsellDue(client(), none, today).due).toBe(false);
    expect(upsellDue(client(), { ...none, visibilityChange3mPct: 20 }, today).due).toBe(true);
    expect(upsellDue(client(), { ...none, top3SharePct: 60 }, today).due).toBe(true);
    expect(upsellDue(client(), { ...none, visibilityChange3mPct: null }, today).due).toBe(false);
  });

  it("needs a service they don't already have", () => {
    expect(upsellDue(client({ nextServices: [] }), earned, today).due).toBe(false);
    expect(upsellDue(client({ services: ["Local SEO", "Google Ads management"] }), earned, today).idea).toBeNull();
  });

  it("works out the facts from stored checks", () => {
    const data = tiny([check("busy", "2026-10-01", 8), check("quiet", "2026-10-01", 2), check("busy", "2026-11-01", 2), check("quiet", "2026-11-01", 2)]);
    const f = upsellFacts(data, "c1");
    expect(f.newTop3Money).toBe(1);
    expect(f.top3SharePct).toBe(100);
    expect(f.visibilityChange3mPct).toBeGreaterThan(0);
    expect(upsellFacts(tiny([]), "c1")).toEqual({ newTop3Money: 0, visibilityChange3mPct: null, top3SharePct: 0 });
  });
});

describe("asking the owner for more room", () => {
  it("is quiet under 80%, asks from 80%, and stops at 100% (never raises anything itself)", () => {
    expect(roomNotice("Cap", 10, 20, "usd").level).toBe("ok");
    expect(roomNotice("Cap", 16, 20, "usd")).toMatchObject({ level: "ask", pct: 80 });
    expect(roomNotice("Cap", 20, 20, "usd").level).toBe("full");
    expect(roomNotice("Cap", 25, 20, "usd").pct).toBe(100);
    expect(roomNotice("Cap", 0, 0).level).toBe("full");
    expect(roomNotice("Keywords", 23, 25).text).toContain("23 of 25");
  });

  it("estimates a round's cost", () => {
    expect(roundCostUsd(1980)).toBe(4.75);
    expect(roundCostUsd(0)).toBe(0);
  });
});

describe("fictional sample", () => {
  it("is clearly fictional: names say so, domains are .example, every figure is 'sample'", () => {
    for (const c of watchSample.clients) {
      expect(c.name).toMatch(/\(fictional\)$/);
      expect(c.domain).toMatch(/\.example$/);
    }
    for (const c of watchSample.competitors) expect(c.domain).toMatch(/\.example$/);
    for (const c of watchSample.checks) {
      expect(c.source).toBe("sample");
      for (const o of c.others) expect(o.domain).toMatch(/\.example$/);
    }
    for (const v of watchSample.volumes) expect(v.source).toBe("sample");
  });

  it("has 26 weekly checks per keyword and market ending on the sample date", () => {
    const dates = checkDates(watchSample.checks);
    expect(dates).toHaveLength(26);
    expect(dates.at(-1)).toBe(WATCH_SAMPLE_TODAY);
    const pairs = new Set(watchSample.checks.map((c) => `${c.keywordId}|${c.marketId}`));
    expect(watchSample.checks).toHaveLength(pairs.size * 26);
  });

  it("stays inside the per-client limits and inside the lower 48 states", () => {
    for (const c of watchSample.clients) {
      expect(watchSample.keywords.filter((k) => k.clientId === c.id).length).toBeLessThanOrEqual(WATCH_RULES.limits.keywords);
      expect(watchSample.markets.filter((m) => m.clientId === c.id).length).toBeLessThanOrEqual(WATCH_RULES.limits.markets);
      expect(watchSample.competitors.filter((m) => m.clientId === c.id).length).toBeLessThanOrEqual(WATCH_RULES.limits.competitors);
    }
    for (const p of [...watchSample.markets, ...watchSampleOpportunities]) {
      expect(p.lat).toBeGreaterThan(24);
      expect(p.lat).toBeLessThan(50);
      expect(p.lng).toBeGreaterThan(-125);
      expect(p.lng).toBeLessThan(-66);
    }
  });

  it("shows a rising and a falling client, movers both ways, a rising competitor, and one upsell due", () => {
    const dates = checkDates(watchSample.checks);
    const trend = (id: string) => trendOf(visibilitySeries(watchSample, id).map((p) => p.visits)).direction;
    expect(trend("w-plumb")).toBe("rising");
    expect(trend("w-roof")).toBe("falling");
    const m = movers(watchSample, dates.at(-5)!, dates.at(-1)!);
    expect(m.up.length).toBeGreaterThan(0);
    expect(m.down.length).toBeGreaterThan(0);
    expect(competitorRisers(watchSample, dates[0]!, dates.at(-1)!).map((r) => r.domain)).toContain("summit-shingle.example");
    const due = watchSample.clients.filter((c) => upsellDue(c, upsellFacts(watchSample, c.id), WATCH_SAMPLE_TODAY).due);
    expect(due.map((c) => c.id)).toEqual(["w-elec"]);
    const name = (id: string) => watchSample.markets.find((x) => x.id === id)?.city ?? id;
    expect(spotTrends(watchSample, name).length).toBeGreaterThan(0);
  });

  it("is the same every time (fixed seed)", async () => {
    const again = await import("@/fixtures/watch-sample");
    expect(again.watchSample.checks[123]).toEqual(watchSample.checks[123]);
  });

  it("blocks the opportunity where a sample client already works", () => {
    const blocked = watchSampleOpportunities.filter((o) => opportunityScore(o.input).blocked);
    expect(blocked.map((o) => o.id)).toEqual(["o8"]);
  });
});

describe("screens (view builders)", () => {
  it("builds the board: one ticker per client, index starts at 100, movers named", async () => {
    const { buildBoard } = await import("@/lib/watch/view");
    const b = buildBoard(watchSample);
    expect(b.tickers).toHaveLength(watchSample.clients.length);
    expect(b.agencyIndex[0]).toBe(100);
    expect(b.movers.up.every((m) => m.clientName.endsWith("(fictional)") && m.marketName.includes(", "))).toBe(true);
    expect(b.risers.every((r) => !watchSample.clients.some((c) => c.domain === r.domain))).toBe(true);
  });

  it("an empty Watcher shows nothing instead of breaking", async () => {
    const { buildBoard, buildDemand } = await import("@/lib/watch/view");
    const empty = { clients: [], markets: [], keywords: [], checks: [], volumes: [], competitors: [] };
    const b = buildBoard(empty);
    expect(b.tickers).toEqual([]);
    expect(b.movers.up).toEqual([]);
    expect(b.risers).toEqual([]);
    expect(buildDemand(empty)).toEqual([]);
  });

  it("builds a client page, and returns nothing for an unknown client", async () => {
    const { buildClient } = await import("@/lib/watch/view");
    expect(buildClient(watchSample, "nope", WATCH_SAMPLE_TODAY)).toBeNull();
    const v = buildClient(watchSample, "w-elec", WATCH_SAMPLE_TODAY)!;
    expect(v.rows.length).toBe(10);
    expect(v.rows[0]!.money).toBe(true);
    expect(v.competitors).toHaveLength(3);
    expect(v.upsell.due).toBe(true);
  });

  it("demand rows only use each client's own cities; blocked opportunities sort last", async () => {
    const { buildDemand, rankOpportunities } = await import("@/lib/watch/view");
    const rows = buildDemand(watchSample);
    expect(rows.every((r) => r.last12.length === 12)).toBe(true);
    const ranked = rankOpportunities(watchSampleOpportunities);
    expect(ranked.at(-1)!.result.blocked).toBe(true);
    expect(ranked[0]!.result.score).toBeGreaterThanOrEqual(ranked[1]!.result.score);
  });
});

describe("Watcher guardrails", () => {
  // Phase B (approved 2026-11-24): screens may now save through the actions file; the pure
  // math, the sample and the round/list helpers still may not touch the database at all.
  it("Watcher code never touches billing, GoHighLevel, the AI, client money or the network", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const files = [...walk("src/lib/watch"), ...walk("src/components/watcher"), ...walk("src/app/(app)/growth/watcher"), "src/fixtures/watch-sample.ts"];
    expect(files.length).toBeGreaterThan(12);
    for (const f of files) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/billing|@\/lib\/ghl|@\/lib\/ai\b|fetch\(|monthly_usd|monthlyUsd|client_money/);
    }
  });

  it("the Watcher math, sample and helpers stay pure: no database, no saves", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const files = [...readdirSync("src/lib/watch").map((n) => `src/lib/watch/${n}`), "src/fixtures/watch-sample.ts"];
    for (const f of files) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/@\/app\/actions|@\/lib\/supabase|@\/lib\/data-source|\.from\(["'`]/);
    }
  });

  it("the round prompt carries websites, keywords and cities, never client names", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/app/(app)/growth/watcher/rounds/[id]/page.tsx", "utf8");
    const call = page.slice(page.indexOf("buildWatchPrompt("), page.indexOf("});", page.indexOf("buildWatchPrompt(")));
    expect(call).not.toMatch(/\.name\b/);
  });
});
