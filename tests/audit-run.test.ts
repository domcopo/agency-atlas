// Run audit (docs/AUDIT_RUN_PLAN.md, Phase E1): which lookups an audit needs, the worst-case
// cost, and recorded (fictional) DataForSEO answers → results block → the same checker →
// pages. No real network calls here. Every business and number is fictional (.example).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAdsIntake, type AdsIntake } from "@/lib/audit/ads";
import { buildAuditConfig, parseIntake, type AuditIntake } from "@/lib/audit/intake";
import { parseAdsResults, parseSeoResults } from "@/lib/audit/results";
import { buildAdsBlock, buildSeoBlock, DFS_PRICE, findCompetitors, mapTermOf, moneyKeywords, planAdsRun, planSeoRun, readMaps, readSerp, readVolume, RUN_RULES, samePlace, seoMoneyTerms, seoUniverse, whoRanksMissing } from "@/lib/audit/run";
import { modelSite } from "@/lib/audit/depth";
import { nearbyTowns } from "@/lib/audit/places-list";
import type { DfsAnswer } from "@/lib/audit/sources/dataforseo";
import { applyWords, AUDIT_WORDS_SCHEMA, fit, wordsInput } from "@/lib/audit/words";

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
    expect(seoMoneyTerms(seoIntake)).toEqual(["home buyers denver", "we buy houses denver", "home buyers near me", "we buy houses near me"]); // business type first
  });

  it("the estimate is the worst case of every lookup, competitors included", () => {
    const plan = planSeoRun(seoIntake, ["summary", "heatmap", "keywords"]);
    expect(plan.first.map((l) => l.id)).toEqual(["suggest:0", "suggest:1", "serp:0", "serp:1", "serp:2", "serp:3", "maps:area", "pack:0", "pack:1"]);
    // The map term is always counted for the home town (it gives the map pack its visits).
    expect(plan.second(["we buy houses denver"]).map((l) => [l.id, l.task.keywords])).toEqual([["volume", ["we buy houses denver"]], ["volume:near", ["we buy houses"]], ["difficulty", ["we buy houses denver"]]]);
    // "near me" and plain searches are counted for the home town, not the whole state.
    expect(plan.second(["we buy houses", "we buy houses denver", "we buy houses near me", "we buy houses colorado"]).find((l) => l.id === "volume:near")?.task.keywords).toEqual(["we buy houses", "we buy houses near me"]);
    expect(plan.second(["we buy houses denver", "we buy houses near me"]).map((l) => [l.id, l.task.location_name])).toEqual([["volume", "Colorado,United States"], ["volume:near", "Denver,Colorado,United States"], ["difficulty", undefined]]);
    expect(plan.perSite("milehighhomes.example", "Mile High Homes (fictional)", true).map((l) => l.id)).toEqual(["ranked:milehighhomes.example", "maps:milehighhomes.example", "instant:milehighhomes.example"]);
    expect(plan.perSite("peakoffers.example", "Peak Offers (fictional)", false).map((l) => l.id)).toEqual(["ranked:peakoffers.example", "maps:peakoffers.example"]);
    const P = DFS_PRICE;
    const expected =
      2 * P["/v3/dataforseo_labs/google/keyword_suggestions/live"] + // business type + the service
      6 * P["/v3/serp/google/organic/live/advanced"] + // 4 money searches + 2 towns' 3-packs
      P["/v3/serp/google/maps/live/advanced"] + // Google Maps from the home town (competitors)
      4 * P["/v3/keywords_data/google_ads/search_volume/live"] + // state, home-town near me, competitors' searches, brands
      P["/v3/dataforseo_labs/google/bulk_keyword_difficulty/live"] +
      6 * (P["/v3/dataforseo_labs/google/ranked_keywords/live"] + P["/v3/serp/google/maps/live/advanced"]) +
      P["/v3/on_page/instant_pages"];
    expect(plan.estimateUsd).toBeCloseTo(expected, 2);
    expect(plan.estimateUsd).toBeLessThan(5); // well under the default per-audit cap
    expect(plan.first[2]?.task).toMatchObject({ keyword: "home buyers denver", location_name: "Denver,Colorado,United States" });
    // Rankings are read only for searches that name this audit's towns or the state (not "near
    // me", which the model leaves out) and are about what the business sells.
    expect(plan.perSite("x.example", null, false)[0]?.task).toMatchObject({ filters: [["keyword_data.keyword", "regex", "denver|arvada|colorado|near me"], "and", ["keyword_data.keyword", "not_regex", "near me"], "and", ["keyword_data.keyword", "regex", "home|buyer|buy|house"]] });
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

  it("Google Maps from the home town finds local rivals first; national marketplaces are skipped", () => {
    const maps = readMaps(ans([{ items: [
      { type: "maps_search", rank_group: 1, domain: "frontrange.example", title: "Front Range Buyers | Cash Offers", rating: { value: 4.9, votes_count: 88 } },
      { type: "maps_search", rank_group: 2, domain: "milehighhomes.example", title: "Mile High Homes" },
      { type: "maps_search", rank_group: 3, title: "No Website Buyers" },
    ] }]));
    expect(maps.map((m) => [m.domain, m.rank, m.reviews])).toEqual([["frontrange.example", 1, 88], ["milehighhomes.example", 2, null], [null, 3, null]]);
    const s = readSerp(serp([{ type: "organic", rank_group: 1, domain: "homelight.com" }, { type: "organic", rank_group: 2, domain: "peakoffers.example", website_name: "Peak Offers" }]));
    expect(findCompetitors([s], "milehighhomes.example", 5, maps)).toEqual([{ domain: "frontrange.example", name: "Front Range Buyers" }, { domain: "peakoffers.example", name: "Peak Offers" }]);
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
      { keyword: "we buy houses near me", search_volume: 99000, cpc: null }, // state-wide: not used
      { keyword: "sell my house fast denver", search_volume: 500, cpc: 30 },
      { keyword: "cash home buyers arvada", search_volume: 40, cpc: null },
      { keyword: "we buy houses colorado", search_volume: 200, cpc: 12 },
    ], 0.075)],
    ["volume:near", ans([{ keyword: "we buy houses near me", search_volume: 2400 }])],
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
    // Pack position = the home town's map search, the same one the heat map shows (#2 in Denver).
    expect([own.gbpRating.value, own.gbpReviews.value, own.gbpPhotos.value, own.packPosition.value]).toEqual([4.9, 41, 12, 2]);
    // Local model: 1300 × 28% + 500 × 10% + 40 × 1% ≈ 414 visits; Boston is outside the market.
    const peak = r.data.sites[1]!;
    expect(peak.organicVisits.value).toBe(414);
    expect([peak.top3?.value, peak.top10?.value, peak.positionedFor?.value, peak.brandSearches?.value]).toEqual([2, 2, 1800, 880]);
    expect(peak.pagesBuilt).toEqual(["/sell-fast-denver/", "/arvada/"]);
    expect(peak.gbpRating.value).toBe(4.8); // from the local pack when no profile lookup answered
    // "we buy houses near me" (#15) stays out of the model: near-me results depend on where the searcher is.
    expect([own.organicVisits.value, own.top10?.value, own.brandSearches?.value, own.pagesBuilt]).toEqual([1300 * 0.03, 1, 320, undefined]);
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
    // Google counts "… lakewood colorado" as the same search as "… lakewood": kept once.
    expect(u).not.toContain("we buy houses lakewood colorado");
    expect(u).toContain("we buy houses colorado");
    expect(u).not.toContain("we buy houses aurora colorado");
    const plan = planSeoRun(seoIntake, ["summary"], area);
    expect(plan.perSite("x.example", null, false)[0]?.task).toMatchObject({ filters: [["keyword_data.keyword", "regex", "denver|arvada|lakewood|colorado|near me"], "and", ["keyword_data.keyword", "not_regex", "near me"], "and", ["keyword_data.keyword", "regex", "home|buyer|buy|house"]] });
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
  it("retries a lookup (up to RUN_RULES.lookupTries) only when DataForSEO's side failed and the set-aside budget allows; competitors also come from the town searches", () => {
    const a = read("src/app/actions.ts");
    const fn = a.slice(a.indexOf("async function runAuditInBackground"));
    expect(fn).toMatch(/attempt < RUN_RULES\.lookupTries;/);
    expect(fn).toMatch(/attempt < RUN_RULES\.lookupTries - 1 && e instanceof DfsError && e\.retryable/);
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

  it("a run that gets no answers, or misses the search counts or every site's rankings, keeps the last results (2026-11-26: no credit wiped an audit)", () => {
    const a = read("src/app/actions.ts");
    const bgFn = a.slice(a.indexOf("async function runAuditInBackground"), a.indexOf("async function saveRunResults"));
    expect(bgFn.match(/if \(answers\.size === 0\) return await finish\("failed", keptNote\(\)\);/g)?.length).toBe(2); // SEO and Google Ads
    const guard = bgFn.indexOf('if (!answers.has("volume") || !sites.some((x) => answers.has(`ranked:${x.domain}`))) return await finish("failed", keptNote());');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(bgFn.indexOf("saveRunResults(db, audit.id, block, { competitors"));
    expect(bgFn).toMatch(/Nothing was saved, so the last results stay\./);
    // Refused lookups aren't billed by DataForSEO, so they don't count toward the run's cost.
    expect(bgFn).toMatch(/if \(!\(e instanceof DfsError\) \|\| e\.mayBeCharged\) costUsd \+= DFS_PRICE\[l\.path\];/);
  });

  it("only a timeout is marked as possibly billed", async () => {
    const { DfsError, dfsLookup } = await import("@/lib/audit/sources/dataforseo");
    expect(new DfsError("x").mayBeCharged).toBe(false);
    const prev = { u: process.env.DATAFORSEO_LOGIN, p: process.env.DATAFORSEO_PASSWORD };
    process.env.DATAFORSEO_LOGIN = "test-login";
    process.env.DATAFORSEO_PASSWORD = "test-password";
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response("", { status: 402 })) as typeof fetch;
      const refused = await dfsLookup("/v3/serp/google/organic/live/advanced", {}).catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(DfsError);
      expect((refused as InstanceType<typeof DfsError>).mayBeCharged).toBe(false);
      globalThis.fetch = (async () => { throw new Error("timeout"); }) as typeof fetch;
      const lost = await dfsLookup("/v3/serp/google/organic/live/advanced", {}).catch((e: unknown) => e);
      expect((lost as InstanceType<typeof DfsError>).mayBeCharged).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
      if (prev.u === undefined) delete process.env.DATAFORSEO_LOGIN; else process.env.DATAFORSEO_LOGIN = prev.u;
      if (prev.p === undefined) delete process.env.DATAFORSEO_PASSWORD; else process.env.DATAFORSEO_PASSWORD = prev.p;
    }
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

describe("counting competitors' searches for the state", () => {
  const plan = planSeoRun(seoIntake, ["summary"]);
  const rankedAns = (domain: string, rows: [string, number, number][]) => ({ result: [{ items: rows.map(([keyword, rank, us]) => ({ keyword_data: { keyword, keyword_info: { search_volume: us } }, ranked_serp_element: { serp_item: { rank_group: rank, domain } } })) }], costUsd: 0 });
  const answers = new Map<string, DfsAnswer>([
    ["ranked:peakoffers.example", rankedAns("peakoffers.example", [["we buy houses arvada co", 1, 50], ["home buyers arvada", 2, 400], ["we buy houses denver", 1, 900], ["arvada weather", 1, 9000], ["we buy houses near me", 1, 99000]])],
  ]);

  it("asks only for local, on-topic searches the universe didn't count, biggest first", () => {
    const l = plan.rankedVolume(answers, ["peakoffers.example"], ["we buy houses denver"]);
    expect(l?.task).toMatchObject({ keywords: ["home buyers arvada", "we buy houses arvada co"], location_name: "Colorado,United States" });
    expect(plan.rankedVolume(new Map(), ["peakoffers.example"], [])).toBeNull();
  });

  it("a search with no state count gets 0 visits, never the US-wide figure", () => {
    const a = new Map<string, DfsAnswer>([...answers, ["volume", ans([{ keyword: "we buy houses denver", search_volume: 1000 }])]]);
    const b = buildSeoBlock(seoIntake, ["summary"], { answers: a, competitors: [{ domain: "peakoffers.example", name: "Peak Offers (fictional)", town: "Denver" }], retrieved: TODAY, costUsd: 0, calls: 0, universe: ["we buy houses denver"] });
    const peak = (b.sites as { website: string; organicVisits: number }[]).find((x) => x.website === "peakoffers.example");
    expect(peak?.organicVisits).toBe(280); // denver 1000 × 28%; "home buyers arvada" (US 400) has no state count
  });
});

describe("2026-11-25 review: variants once, plain home-town searches, map-pack visits, revenue notes", () => {
  const ranked = (domain: string, rows: [string, number][]) => ans([{ items: rows.map(([keyword, rank]) => ({ keyword_data: { keyword, keyword_info: { search_volume: 9999 } }, ranked_serp_element: { serp_item: { rank_group: rank, domain, relative_url: "/" } } })) }]);
  const answers = new Map<string, DfsAnswer>([
    ["suggest:0", ans([{ items: [
      { keyword: "we buy houses denver co", keyword_info: { search_volume: 90 } },
      { keyword: "we buy houses denver colorado", keyword_info: { search_volume: 90 } },
      { keyword: "we buy houses colorado", keyword_info: { search_volume: 30 } },
    ] }])],
    ["volume", ans([
      { keyword: "we buy houses denver", search_volume: 90 },
      { keyword: "we buy houses denver co", search_volume: 90 },
      { keyword: "we buy houses denver colorado", search_volume: 90 },
      { keyword: "we buy houses colorado", search_volume: 30 },
      { keyword: "we buy houses", search_volume: 900 }, // state-wide: not used for the home town
    ])],
    ["volume:near", ans([{ keyword: "we buy houses", search_volume: 500 }, { keyword: "we buy houses near me", search_volume: 40 }])],
    ["pack:0", serp([{ type: "local_pack", rank_group: 2, domain: "milehighhomes.example" }])],
    ["ranked:peakoffers.example", ranked("peakoffers.example", [["we buy houses denver", 4], ["we buy houses denver co", 1], ["we buy houses denver colorado", 2]])],
  ]);
  const competitors = [{ domain: "peakoffers.example", name: "Peak Offers (fictional)", town: "Denver" }];
  const universe = seoUniverse(seoIntake, answers, 1);
  const block = buildSeoBlock(seoIntake, ["summary", "heatmap", "keywords"], { answers, competitors, retrieved: TODAY, costUsd: 0.1, calls: 5, universe });
  const r = parseSeoResults(block, { intake: seoIntake, markets, today: TODAY });

  it("'… denver', '… denver co' and '… denver colorado' are one search; the state alone is not", () => {
    expect(universe).toContain("we buy houses denver");
    expect(universe).not.toContain("we buy houses denver co");
    expect(universe).not.toContain("we buy houses denver colorado");
    expect(universe).toContain("we buy houses colorado");
    if (!r.ok) throw new Error(r.errors.join("; "));
    // Denver counted once (90), not three times (270).
    expect(r.data.demand[0]?.searches.value).toBe(90);
    // The competitor's three variants count once, at the best spot (#1): 90 × 28% ≈ 25.
    expect(r.data.sites[1]?.organicVisits.value).toBe(25);
    expect(r.data.sites[1]?.organicKeywords.value).toBe(1);
  });

  it("plain searches are counted for the home town, and the map pack earns visits", () => {
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.data.homeTownSearches?.value).toBe(500);
    expect(r.data.keywords.find((k) => k.keyword === "we buy houses")?.volume.value).toBe(500);
    // #2 in the home town's pack × every home-town search that shows a pack (2026-11-27: plain
    // 500 + near me 40 + "we buy houses denver" 90 = 630) × 10% = 63; the competitor isn't in it: 0.
    expect(r.data.sites[0]?.packVisits.value).toBe(63);
    expect(r.data.sites[1]?.packVisits.value).toBe(0);
  });

  it("no home-town answer = pack visits unknown, never a guess", () => {
    const less = new Map([...answers].filter(([id]) => id !== "volume:near"));
    const b = buildSeoBlock(seoIntake, ["summary", "heatmap", "keywords"], { answers: less, competitors, retrieved: TODAY, costUsd: 0.1, calls: 4, universe });
    expect((b.sites as { localPackVisits: unknown }[])[0]?.localPackVisits).toBeNull();
    expect(b.homeTownSearches).toBeNull();
  });

  it("the notes writer is told the revenue model, so it never says job values are missing", () => {
    const input = wordsInput(block, "Mile High Homes (fictional)", "home buyers", { averageJobUsd: 230, averageJobConfirmed: true, visitsThatBecomeJobsPercent: 3 });
    expect(input.data.revenue_model).toMatchObject({ average_job_usd: 230, average_job_from: "the business owner", visits_that_become_jobs_percent: 3 });
    expect(input.data.home_town_plain_searches_per_month).toBe(500);
    expect(wordsInput(block, "x", "y").data.revenue_model).toBeUndefined();
  });
});

describe("2026-11-27 review: lumped variants once, local rivals first, map term = business type", () => {
  // Google Ads gives close variants identical figures and history (a car rental audit added the
  // same 2,400 "near me" searches six times: 20,130 instead of ~2,500).
  const history = Array.from({ length: 12 }, (_, i) => ({ year: 2026, month: i + 1, search_volume: 2400 }));
  const lumped = (keyword: string) => ({ keyword, search_volume: 2400, cpc: 2.96, low_top_of_page_bid: 1.25, high_top_of_page_bid: 3.44, competition_index: 82, monthly_searches: history });
  const answers = new Map<string, DfsAnswer>([
    ["suggest:0", ans([{ items: [{ keyword: "we buy houses near me", keyword_info: { search_volume: 9000 } }, { keyword: "house buyers near me", keyword_info: { search_volume: 9000 } }, { keyword: "cash for houses near me", keyword_info: { search_volume: 9000 } }] }])],
    ["volume", ans([{ keyword: "we buy houses denver", search_volume: 90 }])],
    ["volume:near", ans([lumped("we buy houses near me"), lumped("house buyers near me"), lumped("cash for houses near me"), { keyword: "we buy houses", search_volume: 500 }])],
  ]);
  const universe = seoUniverse(seoIntake, answers, 1);
  const block = buildSeoBlock(seoIntake, ["summary", "keywords"], { answers, competitors: [], retrieved: TODAY, costUsd: 0.1, calls: 3, universe });

  it("wordings with the same figures and history count once, with one row", () => {
    expect(universe.filter((k) => k.endsWith("near me")).length).toBeGreaterThanOrEqual(3);
    expect(block.nearMeSearches).toBe(2400);
    const rows = (block.keywords as { keyword: string }[]).filter((k) => k.keyword.endsWith("near me"));
    expect(rows.map((k) => k.keyword)).toEqual(["we buy houses near me"]); // the money term is the one kept
  });

  it("small or history-less figures are never merged (could be a coincidence)", () => {
    const v = readVolume(ans([{ keyword: "a", search_volume: 20, monthly_searches: history }, { keyword: "b", search_volume: 2400 }, lumped("c")]));
    expect(v.get("a")?.twin).toBeNull();
    expect(v.get("b")?.twin).toBeNull();
    expect(v.get("c")?.twin).toBeTruthy();
  });

  it("a site's lumped wordings are modeled once, at its best spot", () => {
    const rows = ["car rental cleveland", "car rentals cleveland"].map((keyword, i) => ({ keyword, position: i + 1, usVolume: 1000, cpc: 1, path: "/" }));
    const m = modelSite(rows as never, () => 1000, () => 1, [{ id: "cleveland", label: "Cleveland", term: "cleveland", nearby: false } as never], "OH", undefined, undefined, () => "same");
    expect(m.keywords).toBe(1);
  });

  it("the map pack is searched for the business type when a service is a kind of it", () => {
    expect(mapTermOf({ niche: "Car Rental", services: ["Daily car rental", "Weekly car rental"] })).toBe("car rental");
    expect(mapTermOf({ niche: "real estate investor", services: ["We buy houses"] })).toBe("we buy houses");
    expect(mapTermOf({ niche: "We buy houses", services: ["Sell my house fast"] })).toBe("sell my house fast");
  });

  it("businesses on Google Maps or in a map pack beat sites seen only in plain results", () => {
    const s = readSerp(serp([
      { type: "organic", rank_group: 1, domain: "bigbrand.example", title: "Big Brand" },
      { type: "organic", rank_group: 2, domain: "bigbrand.example", title: "Big Brand" },
      { type: "local_pack", rank_group: 3, domain: "corner.example", title: "Corner Rentals" },
    ]));
    expect(findCompetitors([s, s, s], "luxe.example").map((c) => c.domain)).toEqual(["corner.example", "bigbrand.example"]);
    expect(findCompetitors([readSerp(serp([{ type: "organic", rank_group: 1, domain: "www.expedia.com", title: "Expedia" }]))], "luxe.example")).toEqual([]);
  });
});

describe("2026-11-27 re-run fixes: map term only for a narrower service, blogs skipped, code lists written out", () => {
  it("a service that IS the business type doesn't switch the map search to it", () => {
    expect(mapTermOf({ niche: "real estate investor", services: ["We buy houses", "Sell my house fast", "Real estate investor"] })).toBe("we buy houses");
  });

  it("blogs and business magazines are never competitors", () => {
    const s = readSerp(serp([
      { type: "organic", rank_group: 1, domain: "blog.investorstories.example", title: "Blog" },
      { type: "organic", rank_group: 2, domain: "www.entrepreneur.com", title: "Entrepreneur" },
    ]));
    expect(findCompetitors([s], "mahoning.example")).toEqual([]);
  });

  it("a shortened list of codes comes back as names, never bare numbers", () => {
    const codes: [string, string][] = [["BUSINESS", "Us (fictional)"], ["COMPETITOR 1", "One (fictional)"], ["COMPETITOR 2", "Two (fictional)"], ["COMPETITOR 3", "Three (fictional)"]];
    const out = applyWords({}, { headline: "The pack is held by COMPETITOR 3, 2 and 1; COMPETITORS 1 & 2 lead.", pageNotes: {}, fixes: [], scorecard: [] }, codes);
    expect(out.headline).toBe("The pack is held by Three (fictional), Two (fictional) and One (fictional); One (fictional) & Two (fictional) lead.");
  });
});

describe("2026-11-27: 30-mile towns and seller situations count as demand", () => {
  const answers = new Map<string, DfsAnswer>([
    ["volume", ans([{ keyword: "we buy houses denver", search_volume: 90 }, { keyword: "we buy houses golden", search_volume: 40 }])],
    ["volume:near", ans([{ keyword: "we buy houses", search_volume: 500 }, { keyword: "sell inherited house", search_volume: 70 }, { keyword: "avoid foreclosure", search_volume: 30 }])],
    ["pack:0", serp([{ type: "local_pack", rank_group: 1, domain: "milehighhomes.example" }])],
  ]);
  const area = { nearby: ["Golden"] };
  const universe = seoUniverse(seoIntake, answers, 0, area);
  const block = buildSeoBlock(seoIntake, ["summary", "heatmap", "keywords"], { answers, competitors: [], retrieved: TODAY, costUsd: 0.1, calls: 3, universe, area });
  const r = parseSeoResults(block, { intake: seoIntake, markets, today: TODAY });

  it("a home buyer's universe includes seller situations; other businesses' doesn't", () => {
    expect(universe).toContain("sell inherited house");
    const shop = parseIntake({ company: "Corner Rentals (fictional)", domain: "corner.example", niche: "Car rental", hqTown: "Denver", state: "CO", services: "Daily car rental", avgJobUsd: 200 });
    if (!shop.ok) throw new Error(shop.errors.join(";"));
    expect(seoUniverse(shop.intake as AuditIntake, new Map(), 0)).not.toContain("sell inherited house");
  });

  it("nearby towns and situations are their own demand rows, added to the total once", () => {
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.data.nearbySearches?.value).toBe(40);
    expect(r.data.situationSearches?.value).toBe(100);
    expect(r.data.homeTownSearches?.value).toBe(500); // situations aren't counted twice
    expect(r.data.keywords.find((k) => k.keyword === "sell inherited house")?.cluster).toBe("Seller situations");
  });

  it("situations don't earn map-pack visits (Google shows articles for them)", () => {
    if (!r.ok) throw new Error(r.errors.join("; "));
    // #1 × (plain 500 + "we buy houses denver" 90) × 15% = 89 (situations and Golden left out).
    expect(r.data.sites[0]?.packVisits.value).toBe(89);
  });
});

describe("2026-11-27: market radius per audit (45 miles by default)", () => {
  const base = { company: "Mile High Homes (fictional)", domain: "milehighhomes.example", niche: "Home buyers", hqTown: "Denver", state: "CO", services: "We buy houses", avgJobUsd: 10000 };
  it("defaults to 45, accepts 10-100, refuses anything else", () => {
    const d = parseIntake(base);
    expect(d.ok && d.intake.radiusMiles).toBe(45);
    const w = parseIntake({ ...base, radiusMiles: "60" });
    expect(w.ok && w.intake.radiusMiles).toBe(60);
    expect(parseIntake({ ...base, radiusMiles: "500" }).ok).toBe(false);
    expect(parseIntake({ ...base, radiusMiles: "abc" }).ok).toBe(false);
  });
  it("a wider radius reaches more towns", () => {
    const near = nearbyTowns("CO", "Denver", 500, 15).length;
    const far = nearbyTowns("CO", "Denver", 500, 45).length;
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
    expect(nearbyTowns("CO", "Denver", 500, 45).every((t) => t.miles <= 45)).toBe(true);
  });
  it("the run uses the audit's radius and the results say which", () => {
    const src = readFileSync("src/app/actions.ts", "utf8");
    expect(src).toMatch(/nearbyTowns\(intake\.state, intake\.hqTown, RUN_RULES\.nearbyTowns, intake\.radiusMiles \?\? INTAKE_DEFAULTS\.radiusMiles\)/);
    const block = buildSeoBlock({ ...seoIntake, radiusMiles: 60 }, ["summary"], { answers: new Map(), competitors: [], retrieved: TODAY, costUsd: 0, calls: 0, universe: [] });
    expect(block.nearbyMiles).toBe(60);
  });
});

describe("audit words fit their space", () => {
  it("long notes end at a full sentence, never mid-word", () => {
    const two = "COMPETITOR 1 holds the top spot in every town. " + "BUSINESS ranks on page two for the main search and has no page for the county".repeat(4);
    const out = fit(two, 300);
    expect(out).toBe("COMPETITOR 1 holds the top spot in every town.");
    const one = "word ".repeat(100).trim();
    const cut = fit(one, 50);
    expect(cut.length).toBeLessThanOrEqual(50);
    expect(cut.endsWith("word…")).toBe(true);
    expect(fit("Short.", 300)).toBe("Short.");
  });

  it("applyWords cuts after names are put back", () => {
    const long = `${"COMPETITOR 1 leads. ".repeat(20)}`;
    const filled = applyWords({}, { headline: "", pageNotes: { rankings: long }, fixes: [], scorecard: [] }, [["COMPETITOR 1", "Rival Roofing (fictional)"]]) as { pageNotes: Record<string, string> };
    expect(filled.pageNotes.rankings!.length).toBeLessThanOrEqual(300);
    expect(filled.pageNotes.rankings!.endsWith("leads.")).toBe(true);
  });
});

describe("a run never picks competitors from half of Google's answers", () => {
  const intake = { services: ["sell my house fast"], hqTown: "Youngstown", niche: "we buy houses" };
  const all = () => new Map<string, unknown>([...seoMoneyTerms(intake).map((_, i) => [`serp:${i}`, {}] as const), ["maps:area", {}]]);

  it("names the first live search that didn't come back, or null when all did", () => {
    expect(whoRanksMissing(intake, all())).toBeNull();
    const noSerp = all();
    noSerp.delete("serp:0");
    // One of 4 money searches may be missing (see the next test); two may not.
    expect(whoRanksMissing(intake, noSerp)).toBeNull();
    noSerp.delete("serp:1");
    expect(whoRanksMissing(intake, noSerp)).toBe(seoMoneyTerms(intake)[0]);
    const noMaps = all();
    noMaps.delete("maps:area");
    expect(whoRanksMissing(intake, noMaps)).toBe(`${mapTermOf(intake)} (Google Maps)`);
  });

  it("with 3+ money searches, one may be missing (listed as a gap); two, or the Maps search, still stop the run", () => {
    const wide = { services: ["we buy houses", "sell my house fast", "cash home buyers", "real estate investor"], hqTown: "Youngstown", niche: "we buy houses" };
    const terms = seoMoneyTerms(wide);
    expect(terms.length).toBeGreaterThanOrEqual(3);
    const full = () => new Map<string, unknown>([...terms.map((_, i) => [`serp:${i}`, {}] as const), ["maps:area", {}]]);
    const oneGone = full();
    oneGone.delete("serp:3");
    expect(whoRanksMissing(wide, oneGone)).toBeNull();
    const twoGone = full();
    twoGone.delete("serp:1");
    twoGone.delete("serp:3");
    expect(whoRanksMissing(wide, twoGone)).toBe(terms[1]);
    oneGone.delete("maps:area");
    expect(whoRanksMissing(wide, oneGone)).toBe(`${mapTermOf(wide)} (Google Maps)`);
    expect(RUN_RULES.moneySearchesMayMiss).toBe(1);
  });

  it("the run stops (keeping the last pages) when one is missing and competitors weren't typed in; DataForSEO hiccups get 3 tries", () => {
    const src = readFileSync("src/app/actions.ts", "utf8");
    expect(src).toMatch(/const missingWho = intake\.competitors\.length \? null : whoRanksMissing\(intake, answers\);\s+if \(missingWho\) return await finish\("failed"/);
    expect(src.indexOf("whoRanksMissing(intake, answers)")).toBeLessThan(src.indexOf("findCompetitors([...serps, ...packSerps]"));
    expect(RUN_RULES.lookupTries).toBe(3);
    expect(RUN_RULES.retryPauseMs.length).toBe(RUN_RULES.lookupTries - 1);
  });
});
