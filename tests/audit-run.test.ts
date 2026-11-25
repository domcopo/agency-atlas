// Run audit (docs/AUDIT_RUN_PLAN.md, Phase E1): which lookups an audit needs, the worst-case
// cost, and recorded (fictional) DataForSEO answers → results block → the same checker →
// pages. No real network calls here. Every business and number is fictional (.example).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAdsIntake, type AdsIntake } from "@/lib/audit/ads";
import { buildAuditConfig, parseIntake, type AuditIntake } from "@/lib/audit/intake";
import { parseAdsResults, parseSeoResults } from "@/lib/audit/results";
import { buildAdsBlock, buildSeoBlock, DFS_PRICE, findCompetitors, moneyKeywords, planAdsRun, planSeoRun, readSerp, RUN_RULES, samePlace, seoMoneyTerms, seoUniverse } from "@/lib/audit/run";
import type { DfsAnswer } from "@/lib/audit/sources/dataforseo";
import { applyWords, AUDIT_WORDS_SCHEMA, wordsInput } from "@/lib/audit/words";

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
    expect(plan.first.map((l) => l.id)).toEqual(["suggest:0", "serp:0", "serp:1", "pack:0", "pack:1"]);
    expect(plan.second(["we buy houses denver"]).map((l) => l.id)).toEqual(["volume", "difficulty"]);
    expect(plan.perSite("milehighhomes.example", "Mile High Homes (fictional)", true).map((l) => l.id)).toEqual(["ranked:milehighhomes.example", "maps:milehighhomes.example", "instant:milehighhomes.example"]);
    expect(plan.perSite("peakoffers.example", "Peak Offers (fictional)", false).map((l) => l.id)).toEqual(["ranked:peakoffers.example", "maps:peakoffers.example"]);
    const P = DFS_PRICE;
    const expected =
      P["/v3/dataforseo_labs/google/keyword_suggestions/live"] +
      4 * P["/v3/serp/google/organic/live/advanced"] +
      2 * P["/v3/keywords_data/google_ads/search_volume/live"] +
      P["/v3/dataforseo_labs/google/bulk_keyword_difficulty/live"] +
      6 * (P["/v3/dataforseo_labs/google/ranked_keywords/live"] + P["/v3/serp/google/maps/live/advanced"]) +
      P["/v3/on_page/instant_pages"];
    expect(plan.estimateUsd).toBeCloseTo(expected, 2);
    expect(plan.estimateUsd).toBeLessThan(5); // well under the default per-audit cap
    expect(plan.first[1]?.task).toMatchObject({ keyword: "we buy houses denver", location_name: "Denver,Colorado,United States" });
    // Rankings are read only for searches that name this audit's towns, the state or "near me".
    expect(plan.perSite("x.example", null, false)[0]?.task).toMatchObject({ filters: [["keyword_data.keyword", "regex", "denver|arvada|colorado|near me"]] });
  });

  it("checkpoints decide the lookups (no heat map = no city packs)", () => {
    expect(planSeoRun(seoIntake, ["summary"]).first.some((l) => l.id.startsWith("pack:"))).toBe(false);
  });
});

describe("reading answers", () => {
  it("competitors found from the live searches skip directories and the business itself", () => {
    expect(findCompetitors([readSerp(hqSerp)], "milehighhomes.example").map((c) => c.domain)).toEqual(["peakoffers.example", "frontrange.example"]);
  });

  it("the newer answer shape: google.com + redirect link, the real site only in the breadcrumb", () => {
    const g = { domain: "google.com", url: "https://google.com/goto?url=abc" };
    const s = readSerp(serp([
      { ...g, type: "organic", rank_group: 1, breadcrumb: "https://milehighhomes.example › sell-fast", website_name: "Mile High Homes" },
      { ...g, type: "organic", rank_group: 2, breadcrumb: "https://call.peakoffers.example › we-buy", website_name: "Peak Offers" },
      { ...g, type: "organic", rank_group: 3 }, // no site anywhere: left out, never "google.com"
      { ...g, type: "local_pack", rank_group: 1, title: "Mile High Homes" },
      { ...g, type: "local_pack", rank_group: 2, title: "Front Range Buyers" },
    ]));
    expect(s?.organic.map((o) => [o.domain, o.rank, o.name])).toEqual([["milehighhomes.example", 1, "Mile High Homes"], ["call.peakoffers.example", 2, "Peak Offers"]]);
    expect(s?.pack.map((p) => p.domain)).toEqual([null, null]);
    expect(findCompetitors([s], "milehighhomes.example")).toEqual([{ domain: "call.peakoffers.example", name: "Peak Offers" }]);
    // With no website in the pack, the business is found by its Google name.
    expect(samePlace(s!.pack[0]!, "milehighhomes.example", "Mile High Homes (fictional)")).toBe(true);
    expect(samePlace(s!.pack[1]!, "milehighhomes.example", "Mile High Homes (fictional)")).toBe(false);
    expect(samePlace({ domain: null, title: "Mile High" }, "x.example", "Mile")).toBe(false); // too short to trust
  });

  it("bad or odd answers become null, never a guess", () => {
    const s = readSerp(serp([{ type: "organic", rank_group: "first", domain: "x.example" }, { type: "local_pack", rank_group: 9, domain: "y.example" }, "junk"]));
    expect(s).toEqual({ organic: [], pack: [], hasPack: true, paid: [], lsa: false });
  });
});

describe("SEO: answers → block → checker", () => {
  const ranked = (domain: string, rows: [string, number, string][]) => ans([{ items: rows.map(([keyword, rank, path]) => ({ keyword_data: { keyword, keyword_info: { search_volume: 9999 } }, ranked_serp_element: { serp_item: { rank_group: rank, domain, relative_url: path } } })) }]);
  const answers = new Map<string, DfsAnswer>([
    ["suggest:0", ans([{ items: [
      { keyword: "we buy houses denver", keyword_info: { search_volume: 1500 } },
      { keyword: "sell my house fast denver", keyword_info: { search_volume: 600 } },
      { keyword: "cash home buyers arvada", keyword_info: { search_volume: 50 } },
      { keyword: "how to sell a house denver", keyword_info: { search_volume: 900 } },
      { keyword: "we buy houses boston", keyword_info: { search_volume: 3000 } },
      { keyword: "we buy houses colorado", keyword_info: { search_volume: 250 } },
    ] }])],
    ["volume", ans([
      { keyword: "we buy houses denver", search_volume: 1300, cpc: 38.2 },
      { keyword: "we buy houses arvada", search_volume: 90, cpc: 21 },
      { keyword: "we buy houses near me", search_volume: 2400, cpc: null },
      { keyword: "sell my house fast denver", search_volume: 500, cpc: 30 },
      { keyword: "cash home buyers arvada", search_volume: 40, cpc: null },
      { keyword: "we buy houses colorado", search_volume: 200, cpc: 12 },
    ], 0.075)],
    ["serp:0", hqSerp],
    ["pack:0", serp([{ type: "local_pack", rank_group: 2, domain: "milehighhomes.example" }])],
    ["pack:1", serp([{ type: "local_pack", rank_group: 1, domain: "peakoffers.example" }, { type: "organic", rank_group: 4, domain: "milehighhomes.example" }])],
    ["ranked:peakoffers.example", ranked("peakoffers.example", [["we buy houses denver", 1, "/"], ["sell my house fast denver", 3, "/sell-fast-denver/"], ["cash home buyers arvada", 12, "/arvada/"], ["we buy houses boston", 2, "/boston/"]])],
    ["ranked:milehighhomes.example", ranked("milehighhomes.example", [["we buy houses denver", 7, "/"], ["we buy houses near me", 15, "/"]])],
    ["maps:milehighhomes.example", ans([{ items: [{ type: "maps_search", domain: "milehighhomes.example", rating: { value: 4.9, votes_count: 41 }, total_photos: 12 }] }])],
    ["brand", ans([{ keyword: "mile high homes", search_volume: 320 }, { keyword: "peak offers", search_volume: 880 }])],
    ["instant:milehighhomes.example", ans([{ items: [{ meta: { title: "Sell Your Denver House Fast | Call 303-555-0100", htags: { h1: ["We Buy Houses"] } }, checks: { no_description: true, is_https: true, no_h1_tag: false } }] }])],
  ]);
  const competitors = [{ domain: "peakoffers.example", name: "Peak Offers (fictional)", town: "Denver" }];
  const universe = seoUniverse(seoIntake, answers, 1);
  const block = buildSeoBlock(seoIntake, ["summary", "heatmap", "keywords"], { answers, competitors, retrieved: "2026-11-25", costUsd: 0.21, calls: 9, universe });

  it("the keyword universe: seeds, seed × town, and local suggestions (no how-to, no other towns)", () => {
    expect(universe).toContain("we buy houses");
    expect(universe).toContain("sell my house fast denver");
    expect(universe).toContain("we buy houses colorado");
    expect(universe).not.toContain("how to sell a house denver");
    expect(universe).not.toContain("we buy houses boston");
  });

  it("passes the same checker as pasted results, with the right numbers", () => {
    const r = parseSeoResults(block, { intake: seoIntake, markets, today: TODAY });
    if (!r.ok) throw new Error(r.errors.join("; "));
    // Demand per town = every search in the universe naming that town (state counts).
    expect(r.data.demand.map((d) => d.searches.value)).toEqual([1300 + 500, 90 + 40]);
    expect(r.data.nearMeSearches.value).toBe(2400);
    expect(r.data.keywords.find((k) => k.keyword === "we buy houses denver")?.positions).toEqual({ "milehighhomes.example": 7, "peakoffers.example": 1 });
    const own = r.data.sites[0]!;
    expect([own.gbpRating.value, own.gbpReviews.value, own.gbpPhotos.value, own.packPosition.value]).toEqual([4.9, 41, 12, 0]);
    // Local model: 1300 × 28% + 500 × 10% + 40 × 1% ≈ 414 visits; Boston is outside the market.
    const peak = r.data.sites[1]!;
    expect(peak.organicVisits.value).toBe(414);
    expect([peak.top3?.value, peak.top10?.value, peak.positionedFor?.value, peak.brandSearches?.value]).toEqual([2, 2, 1800, 880]);
    expect(peak.pagesBuilt).toEqual(["/sell-fast-denver/", "/arvada/"]);
    expect(peak.gbpRating.value).toBe(4.8); // from the local pack when no profile lookup answered
    expect([own.organicVisits.value, own.top10?.value, own.brandSearches?.value, own.pagesBuilt]).toEqual([1300 * 0.03 + 2400 * 0.01, 1, 320, undefined]);
    expect(r.data.visitsScope).toBe("local");
    // The homepage check: phone number removed, no description flagged, home town named.
    expect(r.data.inspection).toMatchObject({ title: "Sell Your Denver House Fast", h1: "We Buy Houses", issues: ["No meta description (Google writes its own snippet)"], namesHomeTown: true });
    // Denver: 2nd in the 3-pack; Arvada: a pack shows but the business isn't in it (0).
    expect(r.data.grids[0]?.ranks).toEqual([[2, 0], [null, null]]);
    expect(own.footprint).toEqual(["denver", "arvada"]);
    expect(r.data.costLedger).toEqual([{ source: "dataforseo", calls: 9, costUsd: 0.21 }]);
    expect(r.data.sourcesUsed).toEqual(["dataforseo"]);
  });

  it("the notes format uses only what structured outputs accept (no length or number limits)", () => {
    expect(JSON.stringify(AUDIT_WORDS_SCHEMA)).not.toMatch(/"(maxItems|minItems|minLength|maxLength|minimum|maximum|multipleOf)"/);
  });

  it("with the wider area: nearby towns join the searches; other towns of the state stay out", () => {
    const area = { nearby: ["Lakewood", "Arvada"], others: ["Denver", "Arvada", "Lakewood", "Aurora", "Boulder"] };
    const sug = new Map<string, DfsAnswer>([["suggest:0", ans([{ items: [{ keyword: "we buy houses aurora colorado", keyword_info: { search_volume: 900 } }, { keyword: "we buy houses lakewood colorado", keyword_info: { search_volume: 80 } }, { keyword: "we buy houses colorado", keyword_info: { search_volume: 250 } }] }])]]);
    const u = seoUniverse(seoIntake, sug, 1, area);
    expect(u).toContain("we buy houses lakewood");
    expect(u).toContain("we buy houses lakewood colorado");
    expect(u).toContain("we buy houses colorado");
    expect(u).not.toContain("we buy houses aurora colorado");
    const plan = planSeoRun(seoIntake, ["summary"], area);
    expect(plan.perSite("x.example", null, false)[0]?.task).toMatchObject({ filters: [["keyword_data.keyword", "regex", "denver|arvada|lakewood|colorado|near me"]] });
  });

  it("the AI gets codes, not names or websites; its words come back with names", () => {
    const input = wordsInput(block, seoIntake.company, seoIntake.niche);
    const sent = JSON.stringify(input.data);
    expect(sent).not.toContain("milehighhomes.example");
    expect(sent).not.toContain("Mile High Homes");
    expect(sent).not.toContain("Peak Offers");
    expect(sent).toContain("COMPETITOR 1");
    expect(sent).not.toContain("sell-fast-denver"); // page addresses stay out; only town names go
    expect(sent).not.toContain("Sell Your Denver House"); // homepage title stays out
    expect(input.data.business_homepage_check).toMatchObject({ has_title: true, title_or_h1_names_home_town: true });
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
  it("retries a lookup once only when DataForSEO's side failed and the set-aside budget allows; competitors also come from the town searches", () => {
    const a = read("src/app/actions.ts");
    const fn = a.slice(a.indexOf("async function runAuditInBackground"));
    expect(fn).toMatch(/attempt < 2/);
    expect(fn).toMatch(/e\.retryable && costUsd \+ DFS_PRICE\[l\.path\] <= budgetUsd/);
    expect(fn).toMatch(/findCompetitors\(\[\.\.\.serps, \.\.\.packSerps\]/);
    expect(fn).toMatch(/Claude's notes weren't written/);
  });

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
