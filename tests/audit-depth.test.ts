// Run audit D1 "data depth" (docs/AUDIT_DEPTH_PLAN.md): keyword universe, local click-through
// model, homepage check. Pure functions; every business and number here is fictional (.example).

import { describe, expect, it } from "vitest";
import { auditMarkets, buildUniverse, ctr, DEPTH_RULES, groupOf, isLocal, localPattern, marketOf, modelSite, readInspection, readRanked, readSuggestions } from "@/lib/audit/depth";

const markets = auditMarkets("Denver", ["Arvada", "Lakewood", "Jefferson County"], "CO");
const answer = (items: unknown[]) => ({ result: [{ items }] });

describe("markets", () => {
  it("matches whole town names, the longest first", () => {
    const m = auditMarkets("Fort Collins", ["Collins"], "CO");
    expect(marketOf("we buy houses fort collins", m)?.label).toBe("Fort Collins");
    expect(marketOf("we buy houses collinsville", m)).toBeNull();
    expect(marketOf("cash buyers jefferson county", markets)?.label).toBe("Jefferson County");
  });

  it("local = a town of this audit, the state name, or near me", () => {
    expect(isLocal("sell house fast lakewood", markets, "CO")).toBe(true);
    expect(isLocal("we buy houses colorado", markets, "CO")).toBe(true);
    expect(isLocal("we buy houses near me", markets, "CO")).toBe(true);
    expect(isLocal("we buy houses boston", markets, "CO")).toBe(false);
    expect(localPattern(markets, "CO")).toBe("denver|arvada|lakewood|jefferson county|colorado|near me");
  });

  it("groups: town label, Near me, the state, else General", () => {
    expect(groupOf("we buy houses arvada", markets, "CO")).toBe("Arvada");
    expect(groupOf("we buy houses near me", markets, "CO")).toBe("Near me");
    expect(groupOf("cash home buyers colorado", markets, "CO")).toBe("Colorado");
    expect(groupOf("we buy houses", markets, "CO")).toBe("General");
  });
});

describe("keyword universe", () => {
  const suggestions = readSuggestions(
    answer([
      { keyword: "Sell My House Fast Denver", keyword_info: { search_volume: 900 }, keyword_properties: { keyword_difficulty: 22 }, search_intent_info: { main_intent: "commercial" } },
      { keyword: "how do i sell my house denver", keyword_info: { search_volume: 5000 } },
      { keyword: "peak offers denver", keyword_info: { search_volume: 400 }, search_intent_info: { main_intent: "navigational" } },
      { keyword: "we buy houses boston", keyword_info: { search_volume: 8000 } },
      { keyword: "cash buyers arvada", keyword_info: { search_volume: 30 } },
      { keyword: 42 },
      "junk",
    ]),
  );

  it("reads suggestions, lowercased, wrong shapes dropped", () => {
    expect(suggestions.map((s) => s.keyword)).toEqual(["sell my house fast denver", "how do i sell my house denver", "peak offers denver", "we buy houses boston", "cash buyers arvada"]);
    expect(suggestions[0]).toMatchObject({ usVolume: 900, difficulty: 22, intent: "commercial" });
  });

  it("seeds first, then seed × town, then local suggestions by volume; no how-to, brand or other towns", () => {
    const u = buildUniverse(["we buy houses"], markets, "CO", suggestions);
    expect(u.slice(0, 5)).toEqual(["we buy houses", "we buy houses denver", "we buy houses arvada", "we buy houses lakewood", "we buy houses jefferson county"]);
    expect(u.slice(5)).toEqual(["sell my house fast denver", "cash buyers arvada"]);
  });

  it("deduplicates and stops at the cap", () => {
    const many = Array.from({ length: DEPTH_RULES.universe + 50 }, (_, i) => ({ keyword: `home buyer ${i} denver`, usVolume: i, difficulty: null, intent: null }));
    const u = buildUniverse(["we buy houses", "We  Buy Houses"], markets, "CO", many);
    expect(u.length).toBe(DEPTH_RULES.universe);
    expect(new Set(u).size).toBe(u.length);
  });
});

describe("local click-through model", () => {
  const ranked = readRanked(
    answer([
      { keyword_data: { keyword: "we buy houses denver", keyword_info: { search_volume: 2000 } }, ranked_serp_element: { serp_item: { rank_group: 2, domain: "www.peakoffers.example", relative_url: "/" } } },
      { keyword_data: { keyword: "we buy houses denver" }, ranked_serp_element: { serp_item: { rank_group: 9, domain: "peakoffers.example", relative_url: "/blog/" } } },
      { keyword_data: { keyword: "sell house arvada" }, ranked_serp_element: { serp_item: { rank_group: 4, domain: "peakoffers.example", relative_url: "/arvada/<script>" } } },
      { keyword_data: { keyword: "we buy houses near me", keyword_info: { search_volume: 700 } }, ranked_serp_element: { serp_item: { rank_group: 18, domain: "peakoffers.example" } } },
      { keyword_data: { keyword: "we buy houses boston" }, ranked_serp_element: { serp_item: { rank_group: 1, domain: "peakoffers.example" } } },
      { keyword_data: { keyword: "we buy houses lakewood" }, ranked_serp_element: { serp_item: { rank_group: 1, domain: "someoneelse.example" } } },
      { keyword_data: { keyword: "we buy houses lakewood" }, ranked_serp_element: { serp_item: { rank_group: "one", domain: "peakoffers.example" } } },
    ]),
    "peakoffers.example",
  );

  it("reads rankings for this site only; odd characters stripped from paths", () => {
    expect(ranked.map((r) => [r.keyword, r.position, r.path])).toEqual([
      ["we buy houses denver", 2, "/"],
      ["we buy houses denver", 9, "/blog/"],
      ["sell house arvada", 4, "/arvada/script"],
      ["we buy houses near me", 18, null],
      ["we buy houses boston", 1, null],
    ]);
  });

  it("visits = state searches × click share of the best position; outside the market ignored", () => {
    const state = new Map([["we buy houses denver", 1000], ["sell house arvada", 100]]);
    const m = modelSite(ranked, (k) => state.get(k) ?? null, (k) => (k === "we buy houses denver" ? 20 : null), markets, "CO");
    // denver: 1000 × 15% (best = #2) = 150; arvada: 100 × 7% = 7; near me: no state count → US 700 × 1% = 7.
    expect(m.visits).toBe(164);
    expect(m.valueUsd).toBe(3000);
    expect([m.keywords, m.top3, m.top10, m.positionedFor]).toEqual([3, 1, 2, 1100]);
    expect(m.markets).toEqual(["Denver", "Arvada"]);
    expect(m.pages).toEqual(["/arvada/script"]); // the homepage isn't a "town page"
    expect(m.positions.get("we buy houses denver")).toBe(2);
  });

  it("the click curve: page 1 by position, page 2 at 1%, beyond nothing", () => {
    expect([ctr(1), ctr(3), ctr(10), ctr(15), ctr(21), ctr(0)]).toEqual([0.28, 0.1, 0.02, 0.01, 0, 0]);
  });
});

describe("homepage check", () => {
  it("reads title, H1 and problems; phone numbers and emails never come through", () => {
    const i = readInspection(answer([{ meta: { title: "Denver Home Buyers - Call (303) 555-0100", htags: { h1: ["Cash for houses: info@milehigh.example"] } }, checks: { no_description: true, no_image_alt: true, is_https: false, title_too_long: false } }]), "Denver");
    expect(i).toEqual({
      title: "Denver Home Buyers",
      h1: "Cash for houses:",
      issues: ["The site isn't on https", "No meta description (Google writes its own snippet)", "Images without alt text"],
      namesHomeTown: true,
    });
  });

  it("no answer = no check; no title or H1 = home town unknown", () => {
    expect(readInspection(undefined, "Denver")).toBeNull();
    expect(readInspection(answer([{ meta: {}, checks: { no_h1_tag: true } }]), "Denver")).toEqual({ title: null, h1: null, issues: ["No H1 heading on the homepage"], namesHomeTown: null });
  });
});
