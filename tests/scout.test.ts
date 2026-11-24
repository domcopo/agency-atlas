// Scout rules (src/lib/scout.ts) and the results checker (src/lib/scout-intake.ts).
// Fictional businesses only ("(fictional)" names, example.com sites, synthetic sources).

import { describe, expect, it } from "vitest";
import {
  businessKey,
  domainOf,
  filterProspects,
  isOpenProspect,
  mapsRouteUrl,
  milesBetween,
  nameKey,
  routeOrder,
  runEstimate,
  safeMapsUrl,
  SCOUT_RULES,
  scoreBusiness,
  scoutFunnel,
  scoutLeft,
  walkInsToday,
  type Prospect,
  type ScoutBusiness,
} from "@/lib/scout";
import { parseScoutResults } from "@/lib/scout-intake";
import { buildScoutPrompt } from "@/lib/scout-prompt";

const D = "2026-11-24";
const sig = <T,>(value: T | null) => ({ value, source: "synthetic://dataforseo", date: D });
const BASE = SCOUT_RULES.base;

function biz(over: Partial<ScoutBusiness> = {}): ScoutBusiness {
  return {
    name: "Sample Roofing (fictional)",
    website: "https://sample-roofing.example.com",
    category: "Roofing contractor",
    address: "100 Sample St (fictional)",
    town: "Austintown",
    lat: BASE.lat + 0.02,
    lng: BASE.lng,
    mapsUrl: null,
    rating: 4.2,
    reviews: 12,
    signals: {},
    ...over,
  };
}

function prospect(id: string, over: Partial<Prospect> = {}): Prospect {
  const b = scoreBusiness(biz({ name: `Sample ${id} (fictional)` }));
  return { ...b, id, status: "new", assignedTo: null, nextOkOn: null, runId: null, createdAt: `${D}T12:00:00Z`, ...over };
}

describe("scoring", () => {
  it("ads + not-optimized signs + weak Maps rank + reviews gap + storefront nearby → high score, reasons strongest first", () => {
    const s = scoreBusiness(
      biz({
        signals: {
          adsSeen: { ...sig(true), keywords: ["roofer near austintown"] },
          paidTraffic: sig(120),
          adToHomePage: sig(true),
          adPageMobileSeconds: sig(6.4),
          mapsRank: { ...sig(14), keyword: "roofer austintown" },
          top3Reviews: sig(160),
          storefront: sig(true),
        },
      }),
    );
    expect(s.score).toBe(98);
    expect(s.angle).toBe("ads");
    expect(s.reasons[0]).toBe('Running Google Ads on "roofer near austintown"');
    expect(s.reasons).toContain("Ad page takes 6.4 s on phones");
    expect(s.reasons).toContain('#14 in Google Maps for "roofer austintown" (not top 3)');
    expect(s.reasons).toContain("12 reviews vs about 160 for the top 3");
  });

  it("'not optimized' points only count when they run ads; 'not found' never adds points", () => {
    const noAds = scoreBusiness(biz({ signals: { adsSeen: sig(false), adToHomePage: sig(true), adPageMobileSeconds: sig(9), mapsRank: { ...sig(2) } } }));
    expect(noAds.reasons.join(" ")).not.toMatch(/Ad page|home page|Google Ads/);
    expect(noAds.angle).toBe("seo");
    const unknown = scoreBusiness(biz({ category: "Bakery", lat: null, lng: null, signals: { adsSeen: sig<boolean>(null), siteLoads: sig<boolean>(null) } }));
    expect(unknown.score).toBe(0);
    expect(unknown.miles).toBeNull();
  });

  it("no website is the website pitch; scores never pass 100", () => {
    const s = scoreBusiness(biz({ website: null, signals: { mapsRank: sig<number>(null), storefront: sig(true) } }));
    expect(s.angle).toBe("website");
    expect(s.reasons).toContain("No website");
    expect(s.reasons).toContain("Not in the Google Maps top 20");
    expect(s.score).toBeLessThanOrEqual(100);
  });
});

describe("matching", () => {
  it("domains and name keys", () => {
    expect(domainOf("https://www.Sample-Roofing.example.com/contact?x=1")).toBe("sample-roofing.example.com");
    expect(domainOf("not a site")).toBeNull();
    expect(nameKey("The Sample Roofing & Siding Co., LLC")).toBe(nameKey("Sample Roofing and Siding"));
    expect(nameKey("Sample Plumbing Services Inc")).toBe("sampleplumbing");
    expect(businessKey({ name: "X", website: "www.a.example.com", town: null })).toBe("d:a.example.com");
    expect(businessKey({ name: "Sample Paving (fictional)", website: null, town: "Boardman" })).toBe("n:samplepavingfictional|boardman");
  });
});

describe("runs, caps and routes", () => {
  it("estimates a run and caps its size", () => {
    expect(runEstimate(100)).toBe(4.25);
    expect(runEstimate(10_000)).toBe(runEstimate(SCOUT_RULES.maxRunSize));
  });

  it("money left this month: lowest of my cap and the total wins; last month doesn't count", () => {
    const now = new Date("2026-11-24T15:00:00Z");
    const rows = [
      { userId: "me", usd: 4.25, at: "2026-11-02T15:00:00Z" },
      { userId: "other", usd: 15, at: "2026-11-10T15:00:00Z" },
      { userId: "me", usd: 9, at: "2026-10-30T15:00:00Z" },
    ];
    expect(scoutLeft({ rows, me: "me", monthlyUsd: 25, myCapUsd: 10, now })).toEqual({ mine: 4.25, myCap: 10, total: 19.25, totalCap: 25, left: 5.75 });
    expect(scoutLeft({ rows, me: "me", monthlyUsd: 25, myCapUsd: null, now }).left).toBe(5.75);
    expect(scoutLeft({ rows: [{ userId: "x", usd: 30, at: "2026-11-02T15:00:00Z" }], me: "me", monthlyUsd: 25, myCapUsd: 10, now }).left).toBe(0);
  });

  it("orders stops nearest-first from the base and builds a Maps link with positions only", () => {
    const far = { id: "far", lat: BASE.lat + 0.3, lng: BASE.lng };
    const near = { id: "near", lat: BASE.lat + 0.01, lng: BASE.lng };
    const mid = { id: "mid", lat: BASE.lat + 0.1, lng: BASE.lng };
    const none = { id: "none", lat: null, lng: null };
    expect(routeOrder([far, none, near, mid]).map((s) => s.id)).toEqual(["near", "mid", "far"]);
    const url = mapsRouteUrl(routeOrder([far, near, mid]))!;
    expect(url.startsWith("https://www.google.com/maps/dir/?api=1&origin=41.10170%2C-80.76450")).toBe(true);
    expect(decodeURIComponent(url)).toContain(`destination=${far.lat.toFixed(5)},${far.lng.toFixed(5)}`);
    expect(decodeURIComponent(url)).toContain("waypoints=");
    expect(mapsRouteUrl([none])).toBeNull();
    expect(milesBetween(BASE, { lat: BASE.lat + 1, lng: BASE.lng })).toBeCloseTo(69.1, 0);
  });

  it("only Google Maps links are shown as Maps links", () => {
    expect(safeMapsUrl("https://www.google.com/maps/place/?q=place_id:abc")).toBeTruthy();
    expect(safeMapsUrl("https://maps.app.goo.gl/abc")).toBeTruthy();
    expect(safeMapsUrl("https://www.google.com/search?q=x")).toBeNull();
    expect(safeMapsUrl("https://evil.example.com/maps")).toBeNull();
    expect(safeMapsUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("lists", () => {
  it("open prospects, filters and the pool", () => {
    const list = [
      prospect("a", { score: 90, angle: "ads" }),
      prospect("b", { score: 50, angle: "seo", assignedTo: "u1" }),
      prospect("c", { status: "do_not_contact" }),
      prospect("d", { status: "not_interested", nextOkOn: "2026-12-30" }),
      prospect("e", { status: "not_interested", nextOkOn: "2026-11-01", angle: "website", score: 10 }),
    ];
    expect(isOpenProspect(list[2]!, D)).toBe(false);
    expect(filterProspects(list, "all", D).map((p) => p.id)).toEqual(["a", "b", "e"]);
    expect(filterProspects(list, "ads", D).map((p) => p.id)).toEqual(["a"]);
    expect(filterProspects(list, "pool", D).map((p) => p.id)).toEqual(["a", "e"]);
  });

  it("walk-ins today: my unvisited prospects, best first, then in route order", () => {
    const list = [
      prospect("mine1", { assignedTo: "me", score: 80, lat: BASE.lat + 0.2 }),
      prospect("mine2", { assignedTo: "me", score: 70, lat: BASE.lat + 0.01 }),
      prospect("visited", { assignedTo: "me", status: "visited", score: 99 }),
      prospect("theirs", { assignedTo: "other", score: 99 }),
    ];
    expect(walkInsToday(list, "me").map((p) => p.id)).toEqual(["mine2", "mine1"]);
  });

  it("funnel counts prospects at each step", () => {
    const list = [prospect("a", { assignedTo: "u" }), prospect("b", { status: "interested", assignedTo: "u" }), prospect("c", { status: "audit" }), prospect("d", { status: "do_not_contact" })];
    const f = scoutFunnel(list, [{ prospectId: "b", kind: "walk_in", outcome: "interested", at: `${D}T15:00:00Z`, by: "u" }]);
    expect(f).toMatchObject({ scouted: 4, assigned: 2, visited: 3, talkedToOwner: 1, interested: 2, audit: 1, won: 0, doNotContact: 1 });
  });
});

describe("results checker", () => {
  const RUN = "00000000-0000-4000-8000-000000000001";
  const file = (businesses: unknown[], over: Record<string, unknown> = {}) => JSON.stringify({ kind: "atlas-scout-results", version: 1, runId: RUN, retrievedOn: D, costUsd: 3.1, businesses, ...over });

  it("accepts a good file, keeps only known fields, drops signals without a source or date", () => {
    const r = parseScoutResults(
      file([
        {
          name: "Sample HVAC (fictional)",
          website: "sample-hvac.example.com",
          category: "HVAC contractor",
          address: "200 Sample Ave (fictional)",
          town: "Boardman",
          lat: 41.02,
          lng: -80.66,
          phone: "330-555-0100",
          ownerName: "Pat Example",
          rating: 4.6,
          reviews: 31.4,
          signals: { adsSeen: { value: true, source: "synthetic://serp", date: D, keywords: ["hvac boardman"] }, mapsRank: { value: 5, source: "", date: D }, hack: { value: 1 } },
        },
      ]),
      RUN,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = r.results.businesses[0]!;
    expect(b.website).toBe("https://sample-hvac.example.com");
    const at = parseScoutResults(file([{ name: "Sample Deck (fictional)", website: "https://deck.example.com/@sample" }]), RUN);
    expect(at.ok && at.results.businesses[0]!.website).toBeNull();
    expect(b.reviews).toBe(31);
    expect(Object.keys(b)).not.toContain("phone");
    expect(Object.keys(b)).not.toContain("ownerName");
    expect(b.signals.adsSeen?.value).toBe(true);
    expect(b.signals.mapsRank).toBeUndefined();
    expect(Object.keys(b.signals)).toEqual(["adsSeen"]);
  });

  it("refuses businesses with contact details in the fields we keep", () => {
    const r = parseScoutResults(
      file([
        { name: "Call 330-555-0100 (fictional)", town: "Canfield" },
        { name: "Sample Paving (fictional)", address: "write to pat@example.com" },
        { name: "Sample Tree (fictional)", category: "Tree service 3305550100" },
        { name: "Sample Fence (fictional)", address: "4400 Sample Ave, Austintown, OH 44515" },
      ]),
      RUN,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results.businesses.map((b) => b.name)).toEqual(["Sample Fence (fictional)"]);
    expect(r.results.refused.map((x) => x.name)).toEqual(["(name hidden)", "Sample Paving (fictional)", "Sample Tree (fictional)"]);
  });

  it("refuses the wrong run, kind, version, bad JSON, too many or too big", () => {
    expect(parseScoutResults(file([], { runId: "00000000-0000-4000-8000-000000000002" }), RUN)).toMatchObject({ ok: false });
    expect(parseScoutResults(file([], { kind: "something" }), RUN)).toMatchObject({ ok: false });
    expect(parseScoutResults(file([], { version: 2 }), RUN)).toMatchObject({ ok: false });
    expect(parseScoutResults("{not json", RUN)).toMatchObject({ ok: false });
    expect(parseScoutResults(file(Array.from({ length: SCOUT_RULES.maxRunSize + 1 }, () => ({ name: "x" }))), RUN)).toMatchObject({ ok: false });
    expect(parseScoutResults(" ".repeat(1_600_000), RUN)).toMatchObject({ ok: false });
    expect(parseScoutResults(file([], { retrievedOn: "yesterday" }), RUN)).toMatchObject({ ok: false });
  });
});

describe("Scout prompt (copy-only)", () => {
  it("carries the run's settings and budget, asks for sources and dates, and forbids contact details", () => {
    const t = buildScoutPrompt({ id: "00000000-0000-4000-8000-000000000009", area: "Boardman, OH", kinds: ["roofing contractor", "plumber"], size: 50, budgetUsd: 2.25 });
    expect(t).toContain("Run id: 00000000-0000-4000-8000-000000000009");
    expect(t).toContain("roofing contractor; plumber");
    expect(t).toContain("$2.25");
    expect(t).toMatch(/Do NOT collect phone numbers, email addresses, or any person's name/);
    expect(t).toMatch(/Never guess or invent a number/);
    expect(t).toContain('"kind": "atlas-scout-results"');
  });
});
