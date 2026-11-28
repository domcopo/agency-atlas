// SEO audit (Phase 1): settings checks, the math, the sample data rules, and a rendered
// check of all eight pages. Pure: no database, no network, no AI.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AUDIT_PAGES } from "@/components/audit/AuditDeck";
import { sampleAuditConfig, sampleAuditData } from "@/fixtures/audit-sample";
import {
  adsEquivalent,
  bestPositionInMarket,
  blendedJobValue,
  clusterRows,
  gridStats,
  growthCurve,
  leaderboard,
  localDemand,
  revenueScenarios,
  runCost,
  usesAssumptions,
  weightedCpc,
} from "@/lib/audit/compute";
import { parseAuditConfig, type AuditConfig } from "@/lib/audit/config";
import type { AuditBundle, AuditData, Fig } from "@/lib/audit/data";
import { boundsOf, fitBounds, fitState, insidePolygon, padBounds, STATES } from "@/lib/audit/geo";
import { shortLabels } from "@/lib/audit/format";
import { packCityPresence, packPresence, revenueFromVisits } from "@/lib/audit/compute";
import { getAuditPreview } from "@/lib/data-source";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const bundle = (config = sampleAuditConfig, data = sampleAuditData): AuditBundle => ({ id: "t", sample: true, config, data });
const render = (b: AuditBundle) => AUDIT_PAGES.map((Page) => renderToStaticMarkup(createElement(Page, { bundle: b })));
const errorsFor = (mutate: (c: Record<string, unknown>) => void): string[] => {
  const c = clone(sampleAuditConfig) as unknown as Record<string, unknown>;
  mutate(c);
  const r = parseAuditConfig(c);
  return r.ok ? [] : r.errors;
};

describe("audit settings (config)", () => {
  it("the sample settings pass the check unchanged", () => {
    const r = parseAuditConfig(clone(sampleAuditConfig));
    expect(r).toEqual({ ok: true, config: sampleAuditConfig });
  });

  it("Semrush is off unless turned on; budget cap defaults to $5; dry run unless turned off", () => {
    const r = parseAuditConfig({ ...clone(sampleAuditConfig), modules: undefined, budgetCapUsd: undefined, dryRun: undefined });
    expect(r.ok && r.config.modules).toEqual({ dataforseo: true, leadsnap: true, semrush: false });
    expect(r.ok && r.config.budgetCapUsd).toBe(5);
    expect(r.ok && r.config.dryRun).toBe(true);
  });

  it("refuses bad input with plain-English reasons", () => {
    expect(parseAuditConfig(null).ok).toBe(false);
    expect(errorsFor((c) => ((c.company as Record<string, unknown>).name = ""))).toContain("Company name is required.");
    expect(errorsFor((c) => ((c.company as Record<string, unknown>).domain = "https://x.example/page")).join()).toMatch(/bare domain/);
    expect(errorsFor((c) => ((c.company as Record<string, unknown>).gbpUrl = "http://maps.example.com/x")).join()).toMatch(/https/);
    expect(errorsFor((c) => ((c.services as { mixShare: number }[])[0]!.mixShare = 0.5)).join()).toMatch(/add up to 100%/);
    expect(errorsFor((c) => ((c.plans as { recommended?: boolean }[])[0]!.recommended = true)).join()).toMatch(/Only one plan/);
    expect(errorsFor((c) => (c.budgetCapUsd = 500)).join()).toMatch(/Budget cap/);
    expect(errorsFor((c) => (c.baselineScenario = "Nope")).join()).toMatch(/Baseline scenario/);
    expect(errorsFor((c) => ((c.funnel as { leadRate: { value: number } }).leadRate.value = 5)).join()).toMatch(/Lead rate/);
    expect(errorsFor((c) => ((c.roadmap as { tasks: { hours: number }[] }[])[0]!.tasks[0]!.hours = 300)).join()).toMatch(/more than the recommended plan/);
    expect(errorsFor((c) => ((c.competitors as { domain: string }[])[0]!.domain = sampleAuditConfig.company.domain)).join()).toMatch(/unique/);
  });

  it("strips hidden control characters from text", () => {
    const c = clone(sampleAuditConfig);
    c.company.niche = "Plumbing\u0000\u0007 ";
    const r = parseAuditConfig(c);
    expect(r.ok && r.config.company.niche).toBe("Plumbing");
  });
});

describe("audit state map", () => {
  it("only known states are allowed, and every market dot must sit inside that state", () => {
    expect(errorsFor((c) => ((c.map as { state: string }).state = "ZZ")).join()).toMatch(/Map state must be a two-letter US state code/);
    // Pittsburgh is just across the Ohio line, in Pennsylvania.
    expect(errorsFor((c) => ((c.markets as { lat?: number; lng?: number }[])[1] = { ...(c.markets as object[])[1], lat: 40.44, lng: -79.99 })).join()).toMatch(/outside Ohio/);
    expect(errorsFor((c) => (((c.markets as { lat?: number }[])[1]!.lat = undefined))).join()).toMatch(/both latitude and longitude/);
  });

  it("the Ohio outline contains Ohio cities and leaves out neighbors", () => {
    const oh = STATES.OH!;
    for (const m of sampleAuditConfig.markets.filter((m) => m.lat !== undefined)) expect(insidePolygon([m.lng!, m.lat!], oh.outline)).toBe(true);
    for (const [lng, lat] of [[-79.99, 40.44], [-86.16, 39.77], [-83.05, 42.33], [-84.5, 38.05]] as [number, number][]) expect(insidePolygon([lng, lat], oh.outline)).toBe(false); // Pittsburgh, Indianapolis, Detroit, Lexington
  });

  it("the projection keeps the state inside its box", () => {
    const p = fitState(STATES.OH!, 300, 300);
    for (const pt of STATES.OH!.outline) {
      const [x, y] = p.project(pt);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(300);
      expect(y).toBeLessThanOrEqual(300);
    }
    expect(p.pxPerMile).toBeGreaterThan(0);
  });
});

describe("audit math", () => {
  it("blends job value by service mix", () => {
    expect(blendedJobValue(sampleAuditConfig)).toBeCloseTo(0.65 * 450 + 0.25 * 2800 + 0.1 * 9000);
  });

  it("revenue = demand × captured × lead rate × close rate × blended job value", () => {
    const rows = revenueScenarios(sampleAuditConfig, 1000)!;
    const base = rows.find((r) => r.baseline)!;
    expect(base.name).toBe("Baseline");
    expect(base.visits).toBeCloseTo(50);
    expect(base.leads).toBeCloseTo(2.5);
    expect(base.jobs).toBeCloseTo(0.75);
    expect(base.revenueMo).toBeCloseTo(0.75 * blendedJobValue(sampleAuditConfig));
    expect(base.revenueYr).toBeCloseTo(base.revenueMo * 12);
  });

  it("missing figures are left out of totals, and all-missing gives null (not zero)", () => {
    const data = clone(sampleAuditData);
    expect(localDemand(data)).toBe(3070 + 640 + 310 + 150 + 120 + 90 + 210); // Cincinnati is null
    data.nearMeSearches.value = null;
    data.demand.forEach((d) => (d.searches.value = null));
    expect(localDemand(data)).toBeNull();
    expect(revenueScenarios(sampleAuditConfig, null)).toBeNull();
    expect(adsEquivalent(null, 10)).toBeNull();
    expect(weightedCpc([])).toBeNull();
  });

  it("weighted CPC skips keywords missing volume or CPC", () => {
    const kws = clone(sampleAuditData.keywords).slice(0, 2);
    expect(weightedCpc(kws)).toBeCloseTo((2400 * 24.1 + 880 * 31.5) / (2400 + 880));
    kws[1]!.cpcUsd.value = null;
    expect(weightedCpc(kws)).toBeCloseTo(24.1);
  });

  it("geo-grid stats count top-3 against ALL points and average only found ranks", () => {
    const s = gridStats({ term: "t", size: 2, spacingMiles: 1, ranks: [[1, 5], [null, 3]], source: "sample", retrieved: "2026-11-17" });
    expect(s).toEqual({ points: 4, found: 3, avg: 3, top3Share: 0.5 });
  });

  it("growth curve starts today, ends at the target and never goes down", () => {
    const c = growthCurve(40, 400);
    expect(c).toHaveLength(13);
    expect(c[0]).toBeCloseTo(40);
    expect(c[12]).toBeCloseTo(400);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]!);
  });

  it("leaderboard sorts by visits with not-found last; clusters pick the best-ranked site", () => {
    const rows = leaderboard(sampleAuditConfig, sampleAuditData);
    expect(rows[0]!.visits).toBeGreaterThanOrEqual(rows[1]!.visits ?? 0);
    expect(rows.filter((r) => r.isClient)).toHaveLength(1);
    const town = clusterRows(sampleAuditData.keywords).find((r) => r.cluster === "City pages")!;
    expect(town.volume).toBe(210 + 90 + 140 + 70);
    expect(town.cpcMin).toBe(17.2);
    expect(["copperline-plumbing.example", "summit-pipe-pros.example", "bluewater-drains.example"]).toContain(town.winner);
    expect(bestPositionInMarket(sampleAuditData.keywords, sampleAuditConfig.company.domain, "Columbus")).toBe(14);
    expect(bestPositionInMarket(sampleAuditData.keywords, sampleAuditConfig.company.domain, "Toledo")).toBeNull();
  });

  it("a dry run costs $0 and every money input is still marked as an assumption", () => {
    expect(sampleAuditConfig.dryRun).toBe(true);
    expect(runCost(sampleAuditData)).toBe(0);
    expect(usesAssumptions(sampleAuditConfig)).toBe(true);
  });
});

describe("audit sample data is fictional and fully sourced", () => {
  it("every business is labeled fictional and every website is a .example address", () => {
    const c = sampleAuditConfig;
    for (const name of [c.agency.name, c.company.name, ...c.competitors.map((x) => x.name)]) expect(name).toMatch(/\((sample|fictional)\)$/);
    for (const d of [c.company.domain, ...c.competitors.map((x) => x.domain), ...sampleAuditData.sites.map((s) => s.domain)]) expect(d).toMatch(/\.example$/);
    expect(c.agency.email).toMatch(/@[a-z.]*example\.com$/);
    expect(c.agency.phone).toMatch(/^555-01\d\d$/);
  });

  it("every figure carries a source and a retrieval date", () => {
    const figs: Fig[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") {
        if ("value" in v && "source" in v) figs.push(v as Fig);
        else Object.values(v).forEach(walk);
      }
    };
    walk(sampleAuditData);
    expect(figs.length).toBeGreaterThan(80);
    for (const f of figs) {
      expect(f.source).toBeTruthy();
      expect(f.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("is reached through data-source, and only by its id", () => {
    expect(getAuditPreview("sample")?.sample).toBe(true);
    expect(getAuditPreview("anything-else")).toBeNull();
  });

  it("audit math and settings files stay pure (no database, network or AI imports)", () => {
    for (const f of ["compute.ts", "config.ts", "format.ts", "data.ts", "geo.ts"]) {
      const text = readFileSync(join(process.cwd(), "src/lib/audit", f), "utf8");
      const imports = [...text.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
      expect(imports.every((i) => i?.startsWith("./"))).toBe(true);
    }
  });
});

describe("rendered check of all eight audit pages", () => {
  const pages = render(bundle());

  it("renders eight pages with no broken numbers", () => {
    expect(pages).toHaveLength(8);
    pages.forEach((html, i) => {
      expect(html).toContain(`Page ${i + 1} / 8`);
      expect(html).not.toMatch(/NaN|undefined|Infinity|\[object Object\]/);
      expect(html).toContain("SAMPLE · FICTIONAL BUSINESS");
    });
  });

  it("missing data prints 'not found' and unconfirmed claims are flagged", () => {
    const all = pages.join("");
    expect(all).toContain("not found");
    expect(all).toContain("not surfaced in Maps for city terms");
  });

  it("the revenue page labels the model and prints every input with its basis", () => {
    const rev = pages[6]!;
    expect(rev).toContain("model");
    expect(rev).toContain("assumption");
    expect(rev).toContain("Inputs:");
    for (const s of sampleAuditConfig.services) expect(rev).toContain(s.name.toLowerCase().replace(/&/g, "&amp;"));
    expect(rev).toContain("not a prediction");
  });

  it("client-supplied figures stop showing 'assumption'", () => {
    const c = clone(sampleAuditConfig);
    c.funnel.leadRate.basis = "client_supplied";
    c.funnel.closeRate.basis = "client_supplied";
    c.services.forEach((s) => (s.jobValueUsd.basis = "client_supplied"));
    const rev = render(bundle(c))[6]!;
    expect(rev).not.toContain(">assumption<");
    expect(rev).toContain("client figure");
  });

  it("prices come from the settings, not the code", () => {
    const c: AuditConfig = clone(sampleAuditConfig);
    c.plans[1]!.priceUsd = 1234;
    expect(render(bundle(c))[7]).toContain("$1,234");
    expect(pages[7]).not.toContain("$1,234");
  });

  it("Semrush and DataForSEO figures show side by side only when Semrush is on", () => {
    expect(pages[0]).toContain("Semrush visits");
    const off = clone(sampleAuditConfig);
    off.modules.semrush = false;
    const p = render(bundle(off));
    expect(p[0]).not.toContain("Semrush visits");
    expect(p[0]).toContain("Semrush was not run");
  });

  it("an audit where nothing was found still renders, saying 'not found' instead of guessing", () => {
    const empty: AuditData = clone(sampleAuditData);
    const nullify = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(nullify);
      if (v && typeof v === "object") {
        if ("value" in v && "source" in v) (v as Fig).value = null;
        else Object.values(v).forEach(nullify);
      }
    };
    nullify(empty);
    empty.grids.forEach((g) => (g.ranks = g.ranks.map((r) => r.map(() => null))));
    const p = render(bundle(sampleAuditConfig, empty));
    p.forEach((html) => expect(html).not.toMatch(/NaN|undefined|Infinity/));
    expect(p[0]).toContain("not found");
    expect(p[6]).toContain("can&#x27;t be modeled");
  });
});

describe("audit template: California, zoomed maps, city pack checks, labels", () => {
  it("the California outline holds Sacramento-area cities and leaves out Reno and Las Vegas", () => {
    const ca = STATES.CA!;
    for (const [lng, lat] of [[-121.49, 38.58], [-121.29, 38.75], [-121.74, 38.54], [-120.8, 38.73], [-118.24, 34.05], [-117.16, 32.72]] as [number, number][]) expect(insidePolygon([lng, lat], ca.outline)).toBe(true);
    for (const [lng, lat] of [[-119.81, 39.53], [-115.14, 36.17], [-123.0, 42.5]] as [number, number][]) expect(insidePolygon([lng, lat], ca.outline)).toBe(false);
  });

  it("a zoomed map fits the markets plus padding inside its box", () => {
    const b = padBounds(boundsOf([[-121.82, 38.44], [-120.8, 38.9]]), 3);
    const p = fitBounds(b, 290, 330);
    for (const pt of [[-121.82, 38.44], [-120.8, 38.9]] as [number, number][]) {
      const [x, y] = p.project(pt);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(290);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(330);
    }
  });

  it("the map view setting accepts only state or markets", () => {
    expect(errorsFor((c) => ((c.map as { view?: string }).view = "world")).join()).toMatch(/Map view/);
    const c = clone(sampleAuditConfig);
    c.map.view = "markets";
    const r = parseAuditConfig(c);
    expect(r.ok && r.config.map.view).toBe("markets");
  });

  it("city pack checks: 0 = checked and not in the pack, null = not checked; never averaged as a rank", () => {
    const g = { term: "t", kind: "pack" as const, size: 3, spacingMiles: 0, ranks: [[0, 2, null]], source: "dataforseo" as const, retrieved: "2026-11-17" };
    expect(packPresence([g])).toEqual({ inPack: 1, checked: 2 });
    expect(gridStats(g).avg).toBe(2);
  });

  it("competitor column labels are unique even when names start the same", () => {
    expect(shortLabels(["Summit Ridge Remodeling (fictional)", "Summit Valley Homes (fictional)", "Harbor Rooter (fictional)", "Copperline Plumbing (fictional)"])).toEqual(["Summit Ridge", "Summit Valley", "Harbor", "Copperline"]);
  });

  it("keywords whose positions were not looked up never claim that nobody ranks", () => {
    const kws = clone(sampleAuditData.keywords).map((k) => ({ ...k, positions: {}, positionsChecked: false }));
    expect(clusterRows(kws).every((r) => !r.checked && r.winner === null)).toBe(true);
  });
});

describe("audit page 1: modeled revenue per site and the client's goal", () => {
  const withGoal = (): AuditConfig => {
    const c = clone(sampleAuditConfig);
    c.competitorRevenue = { visitToJobRate: { value: 0.05, basis: "assumption" } };
    c.goal = { months: 12, packCities: 4, firstPageTerms: ["plumber columbus"] };
    return c;
  };

  it("revenue from visits = visits × visit-to-job rate × blended job value; off when no rate is set", () => {
    const c = withGoal();
    expect(revenueFromVisits(c, 100)).toBeCloseTo(100 * 0.05 * blendedJobValue(c));
    expect(revenueFromVisits(c, null)).toBeNull();
    expect(revenueFromVisits(sampleAuditConfig, 100)).toBeNull();
  });

  it("the settings check validates the rate and the goal", () => {
    expect(errorsFor((c) => (c.competitorRevenue = { visitToJobRate: { value: 2, basis: "assumption" } })).join()).toMatch(/Visit-to-job rate/);
    expect(errorsFor((c) => (c.goal = { months: 99 })).join()).toMatch(/Goal months/);
    const r = parseAuditConfig(withGoal());
    expect(r.ok && r.config.goal?.packCities).toBe(4);
  });

  it("a city counts as in the pack when either term puts the client in the top 3", () => {
    const g = (ranks: (number | null)[][]) => ({ term: "t", kind: "pack" as const, size: 2, spacingMiles: 0, ranks, source: "dataforseo" as const, retrieved: "2026-11-17" });
    expect(packCityPresence([g([[0, 2, null]]), g([[1, 0, null]])])).toEqual({ inPack: 2, checked: 2 });
  });

  it("page 1 shows the revenue column, a goal row and the goal panel, each labeled model / goal / assumption", () => {
    const html = renderToStaticMarkup(createElement(AUDIT_PAGES[0]!, { bundle: bundle(withGoal()) }));
    expect(html).toContain("Modeled revenue/mo");
    expect(html).toContain("12-month goal");
    expect(html).toContain("could be in 12 months");
    expect(html).toContain("audit-goal");
    expect(html).toContain("assumption");
    expect(html).toContain("plumber columbus");
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
    // Without the settings, page 1 stays as before.
    expect(render(bundle())[0]).not.toContain("Modeled revenue/mo");
  });
});

describe("summary: organic keywords card", () => {
  it("never compares the business with itself; when it has the most keywords it says it leads", () => {
    const d = clone(sampleAuditData);
    const own = d.sites.find((s) => s.domain === sampleAuditConfig.company.domain)!;
    own.organicKeywords = { ...own.organicKeywords, value: 99_999 };
    const html = render(bundle(sampleAuditConfig, d))[0]!;
    expect(html).toContain("Organic keywords vs top competitor");
    expect(html).toContain(`${sampleAuditConfig.company.name} leads; next is`);
    expect(html).not.toContain(`${sampleAuditConfig.company.name} vs ${sampleAuditConfig.company.domain}`);
    // The usual case is unchanged.
    expect(render(bundle())[0]).toContain("Organic keywords vs leader");
  });
});

describe("leaderboard order", () => {
  const row = (domain: string, visits: number, isClient = false) => ({ domain, name: domain, isClient, visits, semrushVisits: null, trafficValueUsd: null, revenueMo: null });
  const cells = (html: string) => [...html.matchAll(/<tr[^>]*><td>([^<]*)<\/td><td>([^<]*)<\/td>/g)].map((m) => `${m[1]} ${m[2]}`);

  it("the business at #1 is shown first; otherwise it is pinned under the competitors", async () => {
    const { Leaderboard } = await import("@/components/audit/Leaderboard");
    const top = renderToStaticMarkup(createElement(Leaderboard, { rows: [row("you.example", 12, true), row("a.example", 6), row("b.example", 0)], showSemrush: false }));
    expect(cells(top)).toEqual(["#1 you.example", "2 a.example", "3 b.example"]);
    const second = renderToStaticMarkup(createElement(Leaderboard, { rows: [row("a.example", 18), row("you.example", 12, true), row("b.example", 0)], showSemrush: false }));
    expect(cells(second)).toEqual(["1 a.example", "2 b.example", "#2 you.example"]);
  });
});
