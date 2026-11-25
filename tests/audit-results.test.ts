// Attach audit results (docs/AUDIT_RESULTS_PLAN.md, Phase B1): finding the block in a pasted
// reply and the strict field-by-field check, for SEO and Google Ads. Pure: no database, no
// network, no AI. Every business and number here is fictional (.example).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdsDeck } from "@/components/audit/ads/AdsDeck";
import { AuditDeck } from "@/components/audit/AuditDeck";
import { parseAdsIntake, type AdsIntake } from "@/lib/audit/ads";
import { buildAdsPrompt } from "@/lib/audit/ads-prompt";
import { buildAuditConfig, parseIntake, type AuditIntake } from "@/lib/audit/intake";
import { buildAuditPrompt } from "@/lib/audit/prompt";
import { adsResultsTemplate, extractResultsBlock, parseAdsResults, parseSeoResults, RESULTS_MARKER, seoResultsTemplate } from "@/lib/audit/results";

const TODAY = "2026-11-25";
const settings = { agencyName: "Sample Agency (fictional)", agencyWebsite: null, plans: [], perAuditUsd: 5 };

const seoIntake = (() => {
  const r = parseIntake({ company: "Mile High Homes (fictional)", domain: "milehighhomes.example", niche: "Home buyers", hqTown: "Denver", state: "CO", cities: "Arvada, Westminster", services: "Sell my house fast, Cash home buyers", avgJobUsd: 10000, competitors: [{ name: "Peak Offers (fictional)", domain: "peakoffers.example" }] });
  if (!r.ok) throw new Error(r.errors.join(";"));
  return r.intake as AuditIntake;
})();
const config = buildAuditConfig(seoIntake, settings, TODAY);
const ctx = { intake: seoIntake, markets: config.markets.map((m) => ({ id: m.id, name: m.name })), today: TODAY };

const seoBlock = () => ({
  atlas: "results-v1",
  kind: "seo",
  website: "https://www.MileHighHomes.example/",
  source: "dataforseo",
  retrieved: "2026-11-24",
  sources: ["dataforseo", "semrush"],
  competitors: [
    { name: "Peak Offers (fictional)", website: "peakoffers.example", town: "Denver" },
    { name: "Front Range Buyers (fictional)", website: "frontrangebuyers.example", town: "Arvada" },
  ],
  demand: [
    { city: "Denver", searches: 1900 },
    { city: "arvada", searches: { value: 210, source: "dataforseo", retrieved: "2026-11-24" } },
    { city: "Boulder", searches: 300 },
  ],
  nearMeSearches: 880,
  keywords: [
    { keyword: "Sell My House Fast Denver", group: "Sell fast", money: true, searches: 720, cpcUsd: 41.5, difficulty: 38, ranks: { "milehighhomes.example": null, "peakoffers.example": 2, "frontrangebuyers.example": 7, "someoneelse.example": 1 } },
    { keyword: "cash home buyers denver", group: "Cash buyers", searches: 390, cpcUsd: null, difficulty: 22, ranks: { "milehighhomes.example": 14 } },
  ],
  sites: [
    { website: "milehighhomes.example", googleRating: 4.9, googleReviews: 41, googlePhotos: null, localPackPosition: 0, organicKeywords: 12, organicVisits: 60, localPackVisits: 40, trafficValueUsd: 900, backlinkRank: 70, referringDomains: 25, semrushVisits: 48, rankingPagesIn: ["Denver"] },
    { website: "peakoffers.example", googleRating: 4.7, googleReviews: 220, localPackPosition: 1, organicKeywords: 140, organicVisits: 900, rankingPagesIn: ["Denver", "Arvada", "Westminster"] },
    { website: "other.example", googleRating: 4 },
  ],
  heatmaps: [{ term: "sell my house fast", kind: "pack", cities: [{ city: "Denver", position: 0 }, { city: "Arvada", position: null }, { city: "Westminster", position: 3 }] }],
  scorecard: [{ signal: "City pages", competitors: "Peak: 3 city pages", client: "One page", grade: "gap" }],
  headline: "Peak Offers takes most Denver searches with city pages and 5x the reviews.",
  pageNotes: { rankings: "Two money terms, no page 1 rankings yet." },
  fixes: [{ title: "City pages", detail: "Arvada and Westminster pages first." }],
  cost: [{ source: "dataforseo", calls: 14, costUsd: 0.92 }],
});

const pasted = (block: unknown) => `Here's the audit summary...\n\nLots of words, {not json}.\n\n${RESULTS_MARKER}\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\`\nLet me know if you need anything else!`;

const seo = (block: unknown) => {
  const e = extractResultsBlock(pasted(block));
  if (!e.ok) return { ok: false as const, errors: [e.error] };
  return parseSeoResults(e.block, ctx);
};
const seoErrors = (mutate: (b: ReturnType<typeof seoBlock>) => void) => {
  const b = seoBlock();
  mutate(b);
  const r = seo(b);
  return r.ok ? "" : r.errors.join(" | ");
};

describe("finding the results block", () => {
  it("finds it after the marker, even inside a long chat reply with other brackets", () => {
    const e = extractResultsBlock(pasted(seoBlock()));
    expect(e.ok && e.block.kind).toBe("seo");
  });

  it("accepts a bare JSON file too", () => {
    expect(extractResultsBlock(JSON.stringify(seoBlock())).ok).toBe(true);
  });

  it("says clearly what's wrong when the block is missing, cut off, broken or not ours", () => {
    const err = (t: string) => {
      const e = extractResultsBlock(t);
      return e.ok ? "" : e.error;
    };
    expect(err("")).toMatch(/Paste/);
    expect(err("A report with no block")).toMatch(/Couldn't find/);
    expect(err(`${RESULTS_MARKER}\n{"atlas": "results-v1", "kind": "seo"`)).toMatch(/cut off/);
    expect(err(`${RESULTS_MARKER}\n{"atlas": "results-v1", kind: seo}`)).toMatch(/isn't valid/);
    expect(err(`${RESULTS_MARKER}\n{"hello": 1}`)).toMatch(/isn't an Atlas results block/);
    expect(err(seoResultsTemplate(seoIntake, ["Denver"]))).toMatch(/blank template, not Claude's answer/);
    expect(err("x".repeat(400_001))).toMatch(/too big/);
  });
});

describe("SEO results check", () => {
  it("turns a good block into the pages' data, every figure with a source and date", () => {
    const r = seo(seoBlock());
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.data.retrieved).toBe("2026-11-24");
    expect(r.data.sourcesUsed).toEqual(["dataforseo", "semrush"]);
    expect(r.data.demand.find((d) => d.marketId === "denver")?.searches).toEqual({ value: 1900, source: "dataforseo", retrieved: "2026-11-24" });
    expect(r.data.demand.find((d) => d.marketId === "westminster")?.searches.value).toBeNull();
    expect(r.data.keywords[0]?.keyword).toBe("sell my house fast denver");
    expect(r.data.keywords[0]?.positions).toEqual({ "milehighhomes.example": null, "peakoffers.example": 2, "frontrangebuyers.example": 7 });
    expect(r.data.sites.map((s) => s.domain)).toEqual(["milehighhomes.example", "peakoffers.example", "frontrangebuyers.example"]);
    expect(r.data.sites[0]?.semrushVisits?.source).toBe("semrush");
    expect(r.data.sites[1]?.footprint).toEqual(["denver", "arvada", "westminster"]);
    expect(r.data.sites[2]?.gbpRating.value).toBeNull();
    expect(r.data.grids[0]).toMatchObject({ kind: "pack", size: 2, ranks: [[0, null], [3, null]] });
    expect(r.competitors.map((x) => x.domain)).toEqual(["peakoffers.example", "frontrangebuyers.example"]);
    expect(r.warnings.join(" ")).toMatch(/Boulder/);
    expect(r.warnings.join(" ")).toMatch(/other\.example/);
    expect(r.summary.counts.find((x) => x.label === "keywords")?.n).toBe(2);
  });

  it("refuses results for another business, the wrong kind, or no source/date", () => {
    expect(seoErrors((b) => (b.website = "notthisone.example"))).toMatch(/this audit is for milehighhomes\.example/);
    expect(seoErrors((b) => (b.kind = "ads"))).toMatch(/Google Ads results/);
    expect(seoErrors((b) => (b.source = "sample"))).toMatch(/main source/);
    expect(seoErrors((b) => (b.retrieved = "YYYY-MM-DD"))).toMatch(/blank template, not Claude's answer/);
    expect(seoErrors((b) => (b.retrieved = "2026-13-40"))).toMatch(/real date/);
    expect(seoErrors((b) => (b.retrieved = "2027-01-01"))).toMatch(/not in the future/);
  });

  it("refuses impossible values, bad sources and dates on single figures", () => {
    expect(seoErrors((b) => (b.sites[0]!.googleRating = 7))).toMatch(/Google rating is 7/);
    expect(seoErrors((b) => ((b.keywords[0]!.ranks as Record<string, unknown>)["peakoffers.example"] = 500))).toMatch(/must be 1–100/);
    expect(seoErrors((b) => (b.demand[0]!.searches = { value: 10, source: "model", retrieved: "2026-11-24" } as never))).toMatch(/source must be/);
    expect(seoErrors((b) => (b.demand[0]!.searches = { value: 10, source: "dataforseo", retrieved: "2030-01-01" } as never))).toMatch(/not in the future/);
    expect(seoErrors((b) => (b.keywords[0]!.searches = "lots" as never))).toMatch(/must be a number/);
    expect(seoErrors((b) => (b.heatmaps[0]!.cities[0]!.position = 9 as never))).toMatch(/3-pack position/);
  });

  it("refuses contact details and prices anywhere in the text", () => {
    expect(seoErrors((b) => (b.headline = "Call the owner at 303-555-0100"))).toMatch(/phone number/);
    expect(seoErrors((b) => (b.fixes[0]!.detail = "Email owner@milehighhomes.example"))).toMatch(/email address/);
    expect(seoErrors((b) => (b.headline = "Our Growth plan is $1,500 per month"))).toMatch(/prices come from Atlas settings/);
  });

  it("works for an audit whose rep named no competitors: takes up to 5 from the run", () => {
    const i = { ...seoIntake, competitors: [] };
    const b = seoBlock();
    b.competitors = Array.from({ length: 7 }, (_, n) => ({ name: `Buyer ${n} (fictional)`, website: `buyer${n}.example`, town: "Denver" }));
    const e = extractResultsBlock(pasted(b));
    const r = e.ok ? parseSeoResults(e.block, { ...ctx, intake: i }) : null;
    expect(r?.ok && r.competitors.length).toBe(5);
  });

  it("the filled pages show the real numbers and the sources", () => {
    const r = seo(seoBlock());
    if (!r.ok) throw new Error("bad");
    const html = renderToStaticMarkup(createElement(AuditDeck, { bundle: { id: "x", sample: false, config: { ...config, competitors: r.competitors }, data: r.data } }));
    expect(html).toContain("1,900");
    expect(html).toContain("DataForSEO · Semrush");
    expect(html).toContain("Peak Offers takes most Denver searches");
    expect(html).not.toContain("not pulled yet");
  });
});

describe("Google Ads results check", () => {
  const adsIntake = (() => {
    const r = parseAdsIntake({ company: "Mile High Homes (fictional)", domain: "milehighhomes.example", niche: "Home buyers", hqTown: "Denver", state: "CO", services: "Sell my house fast", avgJobUsd: 10000, budgetsUsd: ["2000"] });
    if (!r.ok) throw new Error(r.errors.join(";"));
    return r.intake as AdsIntake;
  })();
  const block = () => ({
    atlas: "results-v1",
    kind: "ads",
    website: "milehighhomes.example",
    source: "dataforseo",
    retrieved: "2026-11-24",
    searchesChecked: 5,
    keywords: [{ keyword: "sell my house fast denver", searches: 720, cpcLowUsd: 18.2, cpcHighUsd: 61.9, competition: 88 }],
    bidders: [{ name: "Peak Offers (fictional)", website: "peakoffers.example", adsSeen: 4, paidClicks: { value: 1200, source: "semrush" }, spendUsd: 26000 }],
    client: { runningAds: false, adPage: null, mobileSpeed: 41, callButton: true, form: false, lsaShown: null },
    cost: [{ source: "dataforseo", calls: 6, costUsd: 0.31 }],
  });
  const ads = (b: unknown) => {
    const e = extractResultsBlock(pasted(b));
    return e.ok ? parseAdsResults(e.block, { intake: adsIntake, today: TODAY }) : { ok: false as const, errors: [e.error] };
  };

  it("turns a good block into the Ads pages' data", () => {
    const r = ads(block());
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.data.keywords[0]?.cpcHighUsd.value).toBe(61.9);
    expect(r.data.bidders[0]?.paidClicks.source).toBe("semrush");
    expect(r.data.client.runningAds.value).toBe(false);
    expect(r.data.client.lsaShown.value).toBeNull();
    const html = renderToStaticMarkup(createElement(AdsDeck, { bundle: { id: "x", sample: false, agencyName: "Sample Agency (fictional)", agencyWebsite: null, intake: adsIntake, plans: [], data: r.data } }));
    expect(html).toContain("$61.90");
    expect(html).toContain("4 of 5");
  });

  it("refuses bad Ads values", () => {
    const err = (m: (b: ReturnType<typeof block>) => void) => {
      const b = block();
      m(b);
      const r = ads(b);
      return r.ok ? "" : r.errors.join(" | ");
    };
    expect(err((b) => (b.kind = "seo"))).toMatch(/SEO results/);
    expect(err((b) => (b.bidders[0]!.adsSeen = 9))).toMatch(/outside 0–5/);
    expect(err((b) => (b.client.adPage = "javascript:alert(1)" as never))).toMatch(/web address/);
    expect(err((b) => (b.client.runningAds = "yes" as never))).toMatch(/true, false or null/);
    expect(err((b) => (b.keywords[0]!.cpcHighUsd = 5000))).toMatch(/outside 0–1,000/);
  });

  it("the Ads prompt ends with the template, and a filled template passes", () => {
    const p = buildAdsPrompt(adsIntake, ["ads_market"], settings);
    expect(p).toContain(RESULTS_MARKER);
    expect(p).toContain('"website": "milehighhomes.example"');
    const t = adsResultsTemplate(adsIntake);
    const e = extractResultsBlock(t.replaceAll("\"retrieved\": \"YYYY-MM-DD\"", "\"retrieved\": \"2026-11-24\""));
    expect(e.ok && parseAdsResults(e.block, { intake: adsIntake, today: TODAY }).ok).toBe(true);
  });
});

describe("the SEO prompt ends with the template", () => {
  it("has this audit's website, cities and competitors, and an untouched template only needs a date", () => {
    const p = buildAuditPrompt(seoIntake, ["summary", "heatmap"], settings);
    expect(p).toContain(RESULTS_MARKER);
    expect(p).toContain("Use only these city names for demand, ranks and heat maps: Denver, Arvada, Westminster.");
    expect(p).not.toContain("AuditConfig shape");
    const t = seoResultsTemplate(seoIntake, ["Denver", "Arvada", "Westminster"]);
    const e = extractResultsBlock(t.replaceAll("\"retrieved\": \"YYYY-MM-DD\"", "\"retrieved\": \"2026-11-24\""));
    const r = e.ok ? parseSeoResults(e.block, ctx) : null;
    expect(r?.ok).toBe(true);
  });
});

describe("attach results wiring", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("the save action re-checks on the server, as the signed-in person, and stores only the checked block", () => {
    const actions = read("src/app/actions.ts");
    const fn = actions.slice(actions.indexOf("export async function attachAuditResults"), actions.indexOf("/** Owner and managers: hide an audit"));
    expect(fn).toMatch(/^export async function attachAuditResults\([^)]*\)[^{]*\{\n\s+await notWhilePreviewing\(\);/);
    expect(fn).toContain("extractResultsBlock(pasted)");
    expect(fn).toMatch(/parseAdsResults\(found\.block/);
    expect(fn).toMatch(/parseSeoResults\(found\.block/);
    expect(fn).toContain('.update({ data: { v: 1, block: found.block }, config: checked.config, data_retrieved: checked.summary.retrieved })');
    expect(fn).toContain("await getSavedAudit(id)");
    expect(fn).not.toMatch(/askAi|fetch\(/);
  });

  it("every page read checks the stored block again before drawing it", () => {
    const ds = read("src/lib/data-source.ts");
    const seo = ds.slice(ds.indexOf("export async function getSavedAuditBundle"), ds.indexOf("/** The attached results block"));
    expect(seo).toMatch(/parseSeoResults\(block/);
    const ads = ds.slice(ds.indexOf("export async function getSavedAdsBundle"));
    expect(ads.slice(0, 1200)).toMatch(/parseAdsResults\(block/);
  });

  it("the paste box never renders pasted text as HTML and a picked file is only read as text", () => {
    const card = read("src/components/audit/AttachResults.tsx");
    expect(card).not.toMatch(/dangerouslySetInnerHTML|innerHTML|eval\(|new Function/);
    expect(card).toContain("await file.text()");
    expect(card).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
  });
});

describe("the price rule only stops OUR prices (2026-11-25: modeled revenue tripped it)", () => {
  it("allows modeled revenue in the words, refuses our plan prices", () => {
    expect(seoErrors((b) => (b.headline = "A focused plan could add $2,600/mo in modeled revenue."))).toBe("");
    expect(seoErrors((b) => (b.pageNotes = { rankings: "Leaders earn $55,000 a month on this plan of city pages." }))).toBe("");
    expect(seoErrors((b) => (b.headline = "Our Growth plan is $735 per month."))).toMatch(/prices come from Atlas settings/);
    expect(seoErrors((b) => (b.fixes[0]!.detail = "We charge $500/mo for this."))).toMatch(/prices come from Atlas settings/);
  });
});
