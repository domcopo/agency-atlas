// Run audit D1 "data depth" (docs/AUDIT_DEPTH_PLAN.md): keyword universe, local click-through
// model, homepage check. Pure functions; every business and number here is fictional (.example).

import { describe, expect, it } from "vitest";
import { auditMarkets, buildUniverse, ctr, DEPTH_RULES, groupOf, isLocal, localPattern, marketOf, modelSite, namesOtherPlace, namesOtherState, nearbyMarkets, onTopic, pathOtherState, searchGroup, variantKey, readInspection, readRanked, readSuggestions, topicOf, topicPattern } from "@/lib/audit/depth";
import { goalScenario } from "@/lib/audit/compute";

const markets = auditMarkets("Denver", ["Arvada", "Lakewood", "Jefferson County"], "CO");
const answer = (items: unknown[]) => ({ result: [{ items }] });

describe("markets", () => {
  it("matches whole town names, the longest first", () => {
    const m = auditMarkets("Fort Collins", ["Collins"], "CO");
    expect(marketOf("we buy houses fort collins", m)?.label).toBe("Fort Collins");
    expect(marketOf("we buy houses collinsville", m)).toBeNull();
    expect(marketOf("cash buyers jefferson county", markets)?.label).toBe("Jefferson County");
  });

  it("a bigger place whose name ends in a town's name isn't that town (Winston-Salem isn't Salem)", () => {
    const oh = auditMarkets("Youngstown", ["Salem", "Canton", "North Canton"], "OH");
    expect(marketOf("we buy houses winston salem", oh)).toBeNull();
    expect(isLocal("we buy houses winston salem", oh, "OH")).toBe(false);
    expect(marketOf("we buy houses new salem", oh)).toBeNull();
    expect(marketOf("we buy houses salem", oh)?.label).toBe("Salem");
    expect(marketOf("salem cash home buyers", oh)?.label).toBe("Salem");
    // A market that is itself the longer name still matches.
    expect(marketOf("sell house fast north canton", oh)?.label).toBe("North Canton");
    expect(marketOf("sell house fast canton", oh)?.label).toBe("Canton");
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

describe("the wider area", () => {
  const others = new Set(["denver", "arvada", "lakewood", "aurora", "colorado springs", "jefferson county", "golden"]);
  const near = nearbyMarkets(["Golden", "Arvada", "Wheat Ridge"], markets, "CO");

  it("nearby towns: the audit's own markets aren't repeated", () => {
    expect(near.map((m) => [m.label, m.term, m.nearby])).toEqual([["Golden", "golden", true], ["Wheat Ridge", "wheat ridge", true]]);
  });

  it("the state's name counts only when no other town of the state is named", () => {
    expect(isLocal("we buy houses colorado", markets, "CO", others)).toBe(true);
    expect(isLocal("we buy houses colorado springs colorado", markets, "CO", others)).toBe(false);
    expect(isLocal("we buy houses aurora colorado", markets, "CO", others)).toBe(false);
    expect(isLocal("we buy houses denver colorado", markets, "CO", others)).toBe(true); // its own market wins
    expect(namesOtherPlace("sell house fast golden co", markets, others)).toBe(true);
    expect(namesOtherPlace("sell house fast golden co", [...markets, ...near], others)).toBe(false);
  });

  it("rankings in nearby towns add visits but aren't listed as the audit's towns", () => {
    const r = [{ keyword: "we buy houses golden", position: 1, path: "/golden/", usVolume: 100, cpc: null }];
    const m = modelSite(r, () => null, () => null, [...markets, ...near], "CO", others);
    expect([m.visits, m.markets, m.pages]).toEqual([28, [], ["/golden/"]]);
    expect(groupOf("we buy houses golden", [...markets, ...near], "CO")).toBe("Golden");
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
    // denver: 1000 × 15% (best = #2) = 150; arvada: 100 × 7% = 7. "near me" stays out: a US-wide
    // ranking says nothing about where this area's searchers would see it.
    expect(m.visits).toBe(157);
    expect(m.valueUsd).toBe(3000);
    expect([m.keywords, m.top3, m.top10, m.positionedFor]).toEqual([2, 1, 2, 1100]);
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

describe("towns that share a name with a place in another state", () => {
  const oh = auditMarkets("Cleveland", ["Brooklyn", "Lakewood"], "OH");

  it("a search naming another state isn't local, even when the town name matches", () => {
    expect(namesOtherState("car rental brooklyn ny", "OH")).toBe(true);
    expect(namesOtherState("car rental lakewood new jersey", "OH")).toBe(true);
    expect(isLocal("car rental brooklyn ny", oh, "OH")).toBe(false);
    expect(isLocal("car rental lakewood nj", oh, "OH")).toBe(false);
    expect(isLocal("car rental brooklyn ohio", oh, "OH")).toBe(true);
    expect(isLocal("car rental brooklyn oh", oh, "OH")).toBe(true);
  });

  it("everyday two-letter words at the end aren't states", () => {
    expect(namesOtherState("car rental near me", "OH")).toBe(false);
    expect(namesOtherState("rent a car co", "OH")).toBe(false);
    expect(namesOtherState("ny", "OH")).toBe(false);
  });
});

describe("searches about what the business sells", () => {
  const oh = auditMarkets("Cleveland", ["Brooklyn"], "OH");
  const topic = topicOf(["Car Rental", "Daily car rental", "Weekly car rental"], oh);

  it("two topic words are needed when every seed has two or more", () => {
    expect(topic.need).toBe(2);
    expect(onTopic("car rentals cleveland", topic)).toBe(true);
    expect(onTopic("rental cars brooklyn", topic)).toBe(true);
    expect(onTopic("hotels cleveland", topic)).toBe(false);
    expect(onTopic("cleveland weekly news", topic)).toBe(false);
    expect(topicPattern(topic)).toBe("car|rental|daily|weekly");
  });

  it("one word is enough for a one-word business type", () => {
    const t = topicOf(["Plumber"], oh);
    expect([t.need, onTopic("plumbers cleveland", t)]).toEqual([1, true]);
  });

  it("off-topic rankings stay out of the model; cost per click falls back to the ranking's own", () => {
    const r = [
      { keyword: "car rental cleveland", position: 1, path: "/", usVolume: 100, cpc: 2 },
      { keyword: "hotels cleveland", position: 1, path: "/", usVolume: 10000, cpc: 1 },
    ];
    const m = modelSite(r, () => null, () => null, oh, "OH", undefined, topic);
    expect([m.keywords, m.visits, m.valueUsd]).toEqual([1, 28, 56]);
  });
});

describe("the goal is never below today", () => {
  const rows = [
    { name: "Conservative", demandCaptured: 0.025, visits: 23, leads: 0, jobs: 0, revenueMo: 0, revenueYr: 0, baseline: false },
    { name: "Baseline", demandCaptured: 0.05, visits: 47, leads: 0, jobs: 0, revenueMo: 0, revenueYr: 0, baseline: true },
    { name: "Stronger", demandCaptured: 0.08, visits: 74, leads: 0, jobs: 0, revenueMo: 0, revenueYr: 0, baseline: false },
  ];
  it("baseline when above today, else the next larger scenario, else none", () => {
    expect(goalScenario(rows, 10)?.name).toBe("Baseline");
    expect(goalScenario(rows, 66)?.name).toBe("Stronger");
    expect(goalScenario(rows, 100)).toBeNull();
    expect(goalScenario(null, 10)).toBeNull();
  });
});

describe("one count per group of word-order variants", () => {
  it("variants share a key; real differences don't", () => {
    expect(variantKey("car rental near me")).toBe(variantKey("near me car rental"));
    expect(variantKey("car rentals in near me")).toBe(variantKey("car rental near me"));
    expect(variantKey("cheap car rental near me")).not.toBe(variantKey("car rental near me"));
    expect(variantKey("car rental cleveland")).not.toBe(variantKey("car rental near me"));
  });

  it("the universe keeps only the first (most searched) of each group", () => {
    const m = auditMarkets("Cleveland", [], "OH");
    const sug = ["car rental near me", "near me car rental", "car rental in near me", "cheap car rental near me"].map((keyword, i) => ({ keyword, usVolume: 100 - i, difficulty: null, intent: null }));
    expect(buildUniverse(["car rental"], m, "OH", sug)).toEqual(["car rental", "car rental cleveland", "car rental near me", "cheap car rental near me"]);
  });

  it("town pages of another state aren't shown as built for this area", () => {
    expect(pathOtherState("/united-states/car-rental-lakewood-nj.html", "OH")).toBe(true);
    expect(pathOtherState("/us/en/location/unitedstates/newyork/brooklyn", "OH")).toBe(true);
    expect(pathOtherState("/us/en/location/unitedstates/ohio/cleveland/cle", "OH")).toBe(false);
    expect(pathOtherState("/car-rental-cleveland-oh.html", "OH")).toBe(false);
  });
});

describe("searchGroup: Google's one-search variants (2026-11-25 Denver review)", () => {
  const m = auditMarkets("Denver", ["Colorado Springs"], "CO");
  it("a town search drops the state; a state-only search keeps it", () => {
    expect(searchGroup("sell my house fast denver co", m, "CO")).toBe(searchGroup("sell my house fast denver", m, "CO"));
    expect(searchGroup("sell my house fast denver colorado", m, "CO")).toBe(searchGroup("sell my house fast denver", m, "CO"));
    expect(searchGroup("sell my house fast colorado", m, "CO")).not.toBe(searchGroup("sell my house fast", m, "CO"));
    // A town whose name holds the state's name keeps it.
    expect(searchGroup("we buy houses colorado springs", m, "CO")).not.toBe(searchGroup("we buy houses springs", m, "CO"));
    expect(searchGroup("we buy houses colorado springs co", m, "CO")).toBe(searchGroup("we buy houses colorado springs", m, "CO"));
  });
});
