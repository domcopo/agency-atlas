// Run audit (docs/AUDIT_RUN_PLAN.md, Phase E1): which lookups an audit needs, the worst-case
// cost, and recorded (fictional) DataForSEO answers → results block → the same checker →
// pages. No real network calls here. Every business and number is fictional (.example).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAdsIntake, type AdsIntake } from "@/lib/audit/ads";
import { buildAuditConfig, parseIntake, type AuditIntake } from "@/lib/audit/intake";
import { parseAdsResults, parseSeoResults } from "@/lib/audit/results";
import { buildAdsBlock, buildSeoBlock, DFS_PRICE, findCompetitors, moneyKeywords, planAdsRun, planSeoRun, readSerp, RUN_RULES, seoMoneyTerms } from "@/lib/audit/run";
import type { DfsAnswer } from "@/lib/audit/sources/dataforseo";
import { applyWords, wordsInput } from "@/lib/audit/words";

const TODAY = "2026-11-25";
const seoIntake = (() => {
  const r = parseIntake({ company: "Mile High Homes (fictional)", domain: "milehighhomes.example", niche: "Home buyers", hqTown: "Denver", state: "CO", cities: "Arvada", services: "We buy houses", avgJobUsd: 10000 });
  if (!r.ok) throw new Error(r.errors.join(";"));
  return r.intake as AuditIntake;
})();
const config = buildAuditConfig(seoIntake, { agencyName: null, agencyWebsite: null, plans: [], perAuditUsd: 5 }, TODAY);
const markets = config.markets.map((m) => ({ id: m.id, name: m.name }));
const ans = (result: unknown[], costUsd = 0.002): DfsAnswer => ({ result, costUsd });

const serp = (items: unknown[]) => ans([{ items }]);
const hqSerp = serp([
  { type: "local_pack", rank_group: 1, domain: "www.peakoffers.example", title: "Peak Offers (fictional)", rating: { value: 4.8, votes_count: 210 } },
  { type: "local_pack", rank_group: 2, domain: "yelp.com", title: "Yelp" },
  { type: "local_pack", rank_group: 3, domain: "frontrange.example", title: "Front Range Buyers (fictional)", rating: { value: 4.6, votes_count: 95 } },
  { type: "organic", rank_group: 1, domain: "peakoffers.example", url: "https://peakoffers.example/" },
  { type: "organic", rank_group: 2, domain: "zillow.com" },
  { type: "organic", rank_group: 7, domain: "milehighhomes.example" },
  { type: "paid", domain: "fastcash.example", title: "Sell today", url: "https://fastcash.example/lp" },
]);

describe("planning a run", () => {
  it("money keywords: every service in every city, plus near me", () => {
    expect(moneyKeywords(["We buy houses"], ["Denver", "Arvada"]).map((k) => k.keyword)).toEqual(["we buy houses denver", "we buy houses arvada", "we buy houses near me"]);
    expect(seoMoneyTerms(seoIntake)).toEqual(["we buy houses denver", "we buy houses near me"]);
  });

  it("the estimate is the worst case of every lookup, competitors included", () => {
    const plan = planSeoRun(seoIntake, ["summary", "heatmap", "keywords"]);
    const ids = plan.first.map((l) => l.id);
    expect(ids).toEqual(["volume", "difficulty", "serp:0", "serp:1", "pack:0", "pack:1"]);
    const expected = DFS_PRICE["/v3/keywords_data/google_ads/search_volume/live"] + DFS_PRICE["/v3/dataforseo_labs/google/bulk_keyword_difficulty/live"] + 4 * DFS_PRICE["/v3/serp/google/organic/live/advanced"] + 6 * (DFS_PRICE["/v3/dataforseo_labs/google/domain_rank_overview/live"] + DFS_PRICE["/v3/serp/google/maps/live/advanced"]);
    expect(plan.estimateUsd).toBeCloseTo(expected, 2);
    expect(plan.estimateUsd).toBeLessThan(5); // well under the default per-audit cap
    expect(plan.first[2]?.task).toMatchObject({ keyword: "we buy houses denver", location_name: "Denver,Colorado,United States" });
  });

  it("checkpoints decide the lookups (no heat map = no city packs)", () => {
    expect(planSeoRun(seoIntake, ["summary"]).first.some((l) => l.id.startsWith("pack:"))).toBe(false);
  });
});

describe("reading answers", () => {
  it("competitors found from the live searches skip directories and the business itself", () => {
    expect(findCompetitors([readSerp(hqSerp)], "milehighhomes.example").map((c) => c.domain)).toEqual(["peakoffers.example", "frontrange.example"]);
  });

  it("bad or odd answers become null, never a guess", () => {
    const s = readSerp(serp([{ type: "organic", rank_group: "first", domain: "x.example" }, { type: "local_pack", rank_group: 9, domain: "y.example" }, "junk"]));
    expect(s).toEqual({ organic: [], pack: [], hasPack: true, paid: [], lsa: false });
  });
});

describe("SEO: answers → block → checker", () => {
  const answers = new Map<string, DfsAnswer>([
    ["volume", ans([{ keyword: "we buy houses denver", search_volume: 1300, cpc: 38.2 }, { keyword: "we buy houses arvada", search_volume: 90, cpc: 21 }, { keyword: "we buy houses near me", search_volume: 2400, cpc: null }], 0.075)],
    ["serp:0", hqSerp],
    ["pack:0", serp([{ type: "local_pack", rank_group: 2, domain: "milehighhomes.example" }])],
    ["pack:1", serp([{ type: "local_pack", rank_group: 1, domain: "peakoffers.example" }, { type: "organic", rank_group: 4, domain: "milehighhomes.example" }])],
    ["site:peakoffers.example", ans([{ items: [{ metrics: { organic: { count: 340, etv: 1800.5, estimated_paid_traffic_cost: 22000 } } }] }])],
    ["maps:milehighhomes.example", ans([{ items: [{ type: "maps_search", domain: "milehighhomes.example", rating: { value: 4.9, votes_count: 41 }, total_photos: 12 }] }])],
  ]);
  const competitors = [{ domain: "peakoffers.example", name: "Peak Offers (fictional)", town: "Denver" }];
  const block = buildSeoBlock(seoIntake, ["summary", "heatmap", "keywords"], { answers, competitors, retrieved: "2026-11-25", costUsd: 0.21, calls: 9 });

  it("passes the same checker as pasted results, with the right numbers", () => {
    const r = parseSeoResults(block, { intake: seoIntake, markets, today: TODAY });
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.data.demand.map((d) => d.searches.value)).toEqual([1300, 90]);
    expect(r.data.nearMeSearches.value).toBe(2400);
    expect(r.data.keywords.find((k) => k.keyword === "we buy houses denver")?.positions).toEqual({ "milehighhomes.example": 7, "peakoffers.example": 1 });
    const own = r.data.sites[0]!;
    expect([own.gbpRating.value, own.gbpReviews.value, own.gbpPhotos.value, own.packPosition.value]).toEqual([4.9, 41, 12, 0]);
    expect(r.data.sites[1]?.organicVisits.value).toBe(1800.5);
    expect(r.data.sites[1]?.gbpRating.value).toBe(4.8); // from the local pack when no profile lookup answered
    expect(r.data.visitsScope).toBe("national");
    // Denver: 2nd in the 3-pack; Arvada: a pack shows but the business isn't in it (0).
    expect(r.data.grids[0]?.ranks).toEqual([[2, 0], [null, null]]);
    expect(own.footprint).toEqual(["denver", "arvada"]);
    expect(r.data.costLedger).toEqual([{ source: "dataforseo", calls: 9, costUsd: 0.21 }]);
    expect(r.data.sourcesUsed).toEqual(["dataforseo"]);
  });

  it("the AI gets codes, not names or websites; its words come back with names", () => {
    const input = wordsInput(block, seoIntake.company, seoIntake.niche);
    const sent = JSON.stringify(input.data);
    expect(sent).not.toContain("milehighhomes.example");
    expect(sent).not.toContain("Mile High Homes");
    expect(sent).not.toContain("Peak Offers");
    expect(sent).toContain("COMPETITOR 1");
    const filled = applyWords(block, { headline: "COMPETITOR 1 wins Denver; BUSINESS is not in the 3-pack.", pageNotes: { rankings: "x", footprint: "", competitors: "", keywords: "", revenue: "" }, fixes: [{ title: "City pages", detail: "Arvada page first." }], scorecard: [{ signal: "Reviews", competitors: "210", client: "41", grade: "gap" }] }, input.codes);
    expect(filled.headline).toBe("Peak Offers (fictional) wins Denver; Mile High Homes (fictional) is not in the 3-pack.");
    expect(parseSeoResults(filled, { intake: seoIntake, markets, today: TODAY }).ok).toBe(true);
  });

  it("if the AI slips a price or phone number in, the checker refuses the words", () => {
    const input = wordsInput(block, seoIntake.company, seoIntake.niche);
    const bad = applyWords(block, { headline: "Call 303-555-0100", pageNotes: {}, fixes: [], scorecard: [] }, input.codes);
    expect(parseSeoResults(bad, { intake: seoIntake, markets, today: TODAY }).ok).toBe(false);
  });

  it("nothing answered = numbers stay not found (still a valid block)", () => {
    const empty = buildSeoBlock(seoIntake, ["summary"], { answers: new Map(), competitors: [], retrieved: "2026-11-25", costUsd: 0, calls: 0 });
    const r = parseSeoResults(empty, { intake: seoIntake, markets, today: TODAY });
    expect(r.ok && r.data.demand.every((d) => d.searches.value === null)).toBe(true);
  });
});

describe("Google Ads: answers → block → checker", () => {
  const adsIntake = (() => {
    const r = parseAdsIntake({ company: "Mile High Homes (fictional)", domain: "milehighhomes.example", niche: "Home buyers", hqTown: "Denver", state: "CO", services: "We buy houses", avgJobUsd: 10000, competitors: [{ name: "Peak Offers (fictional)", domain: "peakoffers.example" }] });
    if (!r.ok) throw new Error(r.errors.join(";"));
    return r.intake as AdsIntake;
  })();

  it("plans searches + ad checks, and counts spend and speed in the worst case", () => {
    const p = planAdsRun(adsIntake, ["ads_market", "ads_bidders", "ads_spend", "ads_landing"]);
    expect(p.first.map((l) => l.id)).toEqual(["volume", "serp:0", "serp:1"]);
    expect(p.estimateUsd).toBeCloseTo(0.1 + 2 * 0.01 + RUN_RULES.competitors * 0.03 + 0.02, 2);
  });

  it("builds bidders, the business's own ads and speed, and passes the checker", () => {
    const answers = new Map<string, DfsAnswer>([
      ["volume", ans([{ keyword: "we buy houses denver", search_volume: 1300, low_top_of_page_bid: 12.5, high_top_of_page_bid: 48, competition_index: 91 }])],
      ["serp:0", serp([{ type: "paid", domain: "fastcash.example", title: "Sell today", url: "https://fastcash.example/lp" }, { type: "paid", domain: "milehighhomes.example", url: "https://milehighhomes.example/offer" }, { type: "local_services_pack" }])],
      ["serp:1", serp([{ type: "paid", domain: "fastcash.example" }])],
      ["site:fastcash.example", ans([{ items: [{ metrics: { paid: { etv: 900, estimated_paid_traffic_cost: 18000 } } }] }])],
      ["speed", ans([{ categories: { performance: { score: 0.41 } } }])],
    ]);
    const block = buildAdsBlock(adsIntake, ["ads_market", "ads_bidders", "ads_spend", "ads_running", "ads_landing", "ads_lsa"], { answers, retrieved: "2026-11-25" });
    const r = parseAdsResults(block, { intake: adsIntake, today: TODAY });
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.data.bidders.map((b) => [b.domain, b.adsSeen.value])).toEqual([["fastcash.example", 2], ["peakoffers.example", 0]]);
    expect(r.data.bidders[0]?.spendUsd.value).toBe(18000);
    expect(r.data.client.runningAds.value).toBe(true);
    expect(r.data.client.adPage.value).toBe("https://milehighhomes.example/offer");
    expect(r.data.client.mobileSpeed.value).toBe(41);
    expect(r.data.client.lsaShown.value).toBe(true);
    expect(r.data.keywords[0]?.cpcHighUsd.value).toBe(48);
  });
});

describe("run audit wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("checks role, cap and setup first, writes the money row BEFORE any lookup, then works in the background", () => {
    const a = read("src/app/actions.ts");
    const fn = a.slice(a.indexOf("export async function startAuditRun"), a.indexOf("async function runAuditInBackground"));
    expect(fn).toMatch(/^export async function startAuditRun\([^)]*\)[^{]*\{\n\s+await notWhilePreviewing\(\);/);
    const spend = fn.indexOf('from("audit_spend").insert');
    const bg = fn.indexOf("after(() => runAuditInBackground");
    expect(spend).toBeGreaterThan(0);
    expect(bg).toBeGreaterThan(spend);
    expect(fn).not.toMatch(/dfsLookup/); // no lookup before the money check
    const bgFn = a.slice(a.indexOf("async function runAuditInBackground"), a.indexOf("async function saveRunResults"));
    expect(bgFn).toMatch(/parseAdsResults\(block/);
    expect(bgFn).toMatch(/parseSeoResults\(block/);
    expect(bgFn).toMatch(/askAi\(\{ task: AUDIT_WORDS_TASK, data: input\.data, schema: AUDIT_WORDS_SCHEMA/);
  });
});

describe("audit page as steps", () => {
  it("both audit pages show the steps (run inside Atlas first) with the prompt route folded under Advanced", () => {
    for (const f of ["src/app/(app)/audits/[id]/page.tsx", "src/components/audit/ads/AdsAuditView.tsx"]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).toContain("<AuditSteps");
      expect(s, f).toMatch(/run=\{<RunAudit [^>]*compact \/>\}/);
      expect(s, f).toMatch(/advanced=\{[\s\S]*<AttachResults/);
      expect(s, f).toContain("placeIssues={unknownPlaces(i.state, [i.hqTown, ...i.cities])}");
    }
    const steps = readFileSync("src/components/audit/AuditSteps.tsx", "utf8");
    expect(steps).toContain('title="Advanced: run it in Claude yourself"');
  });
});

describe("other-state towns in a run", () => {
  it("the local 3-pack for 'Sharon, PA' is searched from Sharon, Pennsylvania", () => {
    const r = parseIntake({ company: "Sample Roofing (fictional)", domain: "sampleroofing.example", niche: "Roofing", hqTown: "Austintown", state: "OH", cities: "Sharon, PA", services: "Roofing", avgJobUsd: 9000 });
    if (!r.ok) throw new Error(r.errors.join(";"));
    const plan = planSeoRun(r.intake, ["summary", "heatmap"]);
    expect(plan.first.find((l) => l.id === "pack:1")?.task).toMatchObject({ keyword: "roofing", location_name: "Sharon,Pennsylvania,United States" });
    expect(plan.first.find((l) => l.id === "pack:0")?.task).toMatchObject({ location_name: "Austintown,Ohio,United States" });
  });
});

describe("search phrases Google accepts (2026-11-25 run: one long phrase blocked the whole batch)", () => {
  it("cleans symbols and skips phrases over 10 words instead of cutting them", async () => {
    const { searchPhrase } = await import("@/lib/audit/run");
    expect(searchPhrase("Home buying & sales Denver")).toBe("home buying and sales denver");
    expect(searchPhrase("Roofing, gutters (repair) Austintown!")).toBe("roofing gutters repair austintown");
    expect(searchPhrase("commercial property buying and sales denver aurora lakewood arvada westminster thornton")).toBeNull();
    expect(moneyKeywords(["Commerrcial property buying & sales"], ["Denver Aurora Lakewood Arvada Westminster & Thornton", "Denver"], "CO").map((k) => k.keyword)).toEqual([
      "commerrcial property buying and sales denver",
      "commerrcial property buying and sales near me",
    ]);
    for (const k of moneyKeywords(["A very long service name with many words in it"], ["Denver"], "CO")) expect(k.keyword.split(" ").length).toBeLessThanOrEqual(10);
  });
});
