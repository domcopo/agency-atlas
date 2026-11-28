// "Run audit": what Claude is given to write an SEO audit's words (headline, page notes, top
// fixes, scorecard) and how its answer is turned back (docs/AUDIT_RUN_PLAN.md, Phase E1).
// Pure: no network. The AI call itself goes through src/lib/ai/client.ts (no tools).
//
// Claude sees ONLY finished numbers with codes instead of names ("BUSINESS", "COMPETITOR 1"),
// never a website, never anything about our clients. It may not add numbers of its own: the
// words must come from the numbers given. Its answer goes back into the results block and
// through the same checker as everything else (lengths, no contact details, no prices).

export const AUDIT_WORDS_TASK = `You write the short words for a local SEO audit of a prospect, for a marketing agency.
You are given finished numbers only. Rules:
- Use ONLY the numbers given. Never add, estimate or guess a number, a price or a fact that isn't in the data.
- Refer to businesses only by their codes as given (BUSINESS, COMPETITOR 1, ...), each code written in full every time ("COMPETITOR 1, COMPETITOR 2 and COMPETITOR 3", never "COMPETITORS 1, 2 and 3" or "COMPETITOR 2 to 5"). No websites, emails or phone numbers.
- Plain, confident English a business owner understands. No hype, no guarantees.
- If the data is thin, say less.
- If revenue_model is given, the revenue page already shows revenue from it: describe it as a model; never say deal values or revenue figures are missing.
- A local 3-pack position of 0 means the pack was shown and other businesses held its 3 spots; null means not checked. Never say no business is in the pack.
- If maps_grid is given, it is where BUSINESS ranks in the Google Maps app at points around the home town. Mention it in the footprint note, especially when it differs from the 3-pack (in the pack but not in the Maps top 20 is worth saying plainly).`;

// The slides give each note about 300 characters; longer answers are cut at a sentence (fit).
const NOTE = "One or two short sentences, under 250 characters in all.";

export const AUDIT_WORDS_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "pageNotes", "fixes", "scorecard"],
  properties: {
    headline: { type: "string", description: "One sentence: the main gap and why it matters, from the numbers." },
    pageNotes: {
      type: "object",
      additionalProperties: false,
      required: ["rankings", "footprint", "competitors", "keywords", "revenue"],
      properties: {
        rankings: { type: "string", description: NOTE },
        footprint: { type: "string", description: NOTE },
        competitors: { type: "string", description: NOTE },
        keywords: { type: "string", description: NOTE },
        revenue: { type: "string", description: NOTE },
      },
    },
    // No maxItems: structured outputs refuse array-length rules (a 400). The counts are asked for
    // in the descriptions and enforced when the answer is read (applyWords).
    fixes: { type: "array", description: "Up to 5 fixes, most important first.", items: { type: "object", additionalProperties: false, required: ["title", "detail"], properties: { title: { type: "string" }, detail: { type: "string" } } } },
    scorecard: {
      type: "array",
      description: "Up to 6 rows.",
      items: { type: "object", additionalProperties: false, required: ["signal", "competitors", "client", "grade"], properties: { signal: { type: "string" }, competitors: { type: "string" }, client: { type: "string" }, grade: { type: "string", enum: ["gap", "partial", "good"] } } },
    },
  },
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const val = (v: unknown) => (typeof v === "number" ? v : obj(v).value ?? null);

export interface WordsInput {
  data: Obj;
  /** code → real name, to put names back into Claude's words. */
  codes: [string, string][];
}

/** The coded, numbers-only view of a results block that Claude gets. */
/** The revenue page's inputs, so the notes describe that model instead of saying it is missing. */
export interface RevenueInputs {
  averageJobUsd: number;
  averageJobConfirmed: boolean;
  visitsThatBecomeJobsPercent: number;
}

export function wordsInput(block: Obj, company: string, niche: string, model?: RevenueInputs): WordsInput {
  const revenue = model
    ? {
        how: "The revenue page shows a model: modeled visits x the share that become jobs x the average job. It is a model, not reported revenue.",
        average_job_usd: model.averageJobUsd,
        average_job_from: model.averageJobConfirmed ? "the business owner" : "an assumption",
        visits_that_become_jobs_percent: model.visitsThatBecomeJobsPercent,
      }
    : null;
  const sites = arr(block.sites).map(obj);
  const comps = arr(block.competitors).map(obj);
  const code = new Map<string, string>();
  const codes: [string, string][] = [["BUSINESS", company]];
  code.set(String(block.website), "BUSINESS");
  comps.forEach((c, i) => {
    code.set(String(c.website), `COMPETITOR ${i + 1}`);
    codes.push([`COMPETITOR ${i + 1}`, typeof c.name === "string" ? c.name : `Competitor ${i + 1}`]);
  });
  const coded = (d: unknown) => code.get(String(d)) ?? null;
  // Towns named in a competitor's page addresses ("/sell-my-house-arvada/" → Arvada). Only
  // town names from this audit go out, never the addresses (they can hold a business name).
  const towns = arr(block.demand).map(obj).map((d) => String(d.city ?? "")).filter(Boolean);
  const townsIn = (paths: unknown) => {
    const text = arr(paths).map((p) => ` ${String(p).toLowerCase().replace(/[^a-z0-9]+/g, " ")} `).join(" ");
    return towns.filter((t) => text.includes(` ${t.split(",")[0]!.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `));
  };
  const ins = block.inspection === undefined ? null : obj(block.inspection);
  return {
    codes,
    data: {
      kind_of_business: niche,
      demand_by_city: arr(block.demand).map(obj).map((d) => ({ city: d.city, searches_per_month: val(d.searches) })),
      near_me_searches_per_month: val(block.nearMeSearches),
      home_town_plain_searches_per_month: val(block.homeTownSearches),
      nearby_towns_searches_per_month: val(block.nearbySearches),
      nearby_towns_radius_miles: typeof block.nearbyMiles === "number" ? block.nearbyMiles : null,
      seller_situation_searches_per_month: val(block.situationSearches),
      ...(revenue ? { revenue_model: revenue } : {}),
      money_keywords: arr(block.keywords)
        .map(obj)
        .filter((k) => k.money === true)
        .map((k) => ({ keyword: k.keyword, searches: val(k.searches), cost_per_click_usd: val(k.cpcUsd), ranks: Object.fromEntries(Object.entries(obj(k.ranks)).map(([d, r]) => [coded(d) ?? "OTHER", r])) })),
      sites: sites.filter((s) => coded(s.website)).map((s) => ({
        who: coded(s.website),
        google_rating: val(s.googleRating),
        google_reviews: val(s.googleReviews),
        local_3pack_position_in_home_town: val(s.localPackPosition),
        local_searches_ranked_for: val(s.organicKeywords),
        local_visits_modeled: val(s.organicVisits),
        searches_in_top_3: val(s.top3),
        searches_in_top_10: val(s.top10),
        monthly_searches_on_top_10_terms: val(s.positionedFor),
        brand_searches_per_month: val(s.brandSearches),
        cities_with_ranking_pages: s.rankingPagesIn ?? [],
        ...(Array.isArray(s.pagesBuilt) ? { town_pages_built: s.pagesBuilt.length, towns_named_in_those_pages: townsIn(s.pagesBuilt) } : {}),
      })),
      ...(ins
        ? { business_homepage_check: { has_title: !!ins.title, has_h1: !!ins.h1, title_or_h1_names_home_town: ins.namesHomeTown ?? null, problems: arr(ins.issues).filter((x) => typeof x === "string") } }
        : {}),
      local_3pack_by_city: arr(block.heatmaps).map(obj).flatMap((h) => arr(h.cities).map(obj).map((c) => ({ city: c.city, business_position: c.position }))),
      ...mapsGrid(block),
    },
  };
}

/** The Google Maps grid as counts only (no names, no places): where BUSINESS ranks around the home town. */
function mapsGrid(block: Obj): { maps_grid?: Obj } {
  const h = arr(block.heatmaps).map(obj).find((x) => x.kind === "maps" && Array.isArray(x.ranks));
  if (!h) return {};
  const cells = arr(h.ranks).flatMap((row) => arr(row)).map((r) => (typeof r === "number" ? r : null));
  if (!cells.length) return {};
  const ranked = cells.filter((r): r is number => r !== null);
  return {
    maps_grid: {
      search: typeof h.term === "string" ? h.term : null,
      points_checked: cells.length,
      miles_between_points: typeof h.spacingMiles === "number" ? h.spacingMiles : null,
      points_business_in_top_3: ranked.filter((r) => r <= 3).length,
      points_business_in_top_10: ranked.filter((r) => r <= 10).length,
      points_business_not_in_top_20: cells.length - ranked.length,
      other_businesses_often_in_top_3: arr(h.leaders).length,
    },
  };
}

/**
 * Text cut to fit a space without ending mid-sentence: the last full sentence that fits (even a short one: a whole sentence reads better than a cut one), or
 * (one long sentence) the last whole word with "…". Names are put back before this, so a
 * long name never pushes a note past its space.
 */
export function fit(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(...[". ", "! ", "? "].map((e) => cut.lastIndexOf(e)));
  if (end > 0) return cut.slice(0, end + 1);
  const word = cut.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[\s,;:–—-]+$/, "");
  return `${word}…`;
}

/** Claude's answer → the words fields of the results block, with names put back. */
export function applyWords(block: Obj, answer: unknown, codes: [string, string][]): Obj {
  const a = obj(answer);
  const named = (t: unknown, max: number) => {
    if (typeof t !== "string") return "";
    // A shortened list ("COMPETITORS 2, 3 and 5", "COMPETITOR 1, 2 and 3") is written out in
    // full first, so no bare numbers are left where names belong (a Denver audit read
    // "held by Need To Sell My House Fast in Denver, 2 and 1").
    let s = t.replace(/COMPETITORS?\s+(\d+)((?:\s*(?:,\s*(?:and\s+|&\s*)?|and\s+|&\s*)\d+\b)+)/g, (_, first: string, rest: string) => `COMPETITOR ${first}${rest.replace(/(\d+)/g, "COMPETITOR $1")}`);
    // Longest codes first, so "COMPETITOR 10" isn't half-replaced by "COMPETITOR 1".
    for (const [c, n] of [...codes].sort((x, y) => y[0].length - x[0].length)) s = s.split(c).join(n);
    return fit(s.trim(), max);
  };
  const notes = obj(a.pageNotes);
  return {
    ...block,
    headline: named(a.headline, 400),
    pageNotes: Object.fromEntries(["rankings", "footprint", "competitors", "keywords", "revenue"].map((k) => [k, named(notes[k], 300)])),
    fixes: arr(a.fixes)
      .slice(0, 5)
      .map(obj)
      .map((f) => ({ title: named(f.title, 80), detail: named(f.detail, 240) })),
    scorecard: arr(a.scorecard)
      .slice(0, 6)
      .map(obj)
      .map((r) => ({ signal: named(r.signal, 60), competitors: named(r.competitors, 160), client: named(r.client, 160), grade: ["gap", "partial", "good"].includes(String(r.grade)) ? r.grade : "partial" })),
  };
}
