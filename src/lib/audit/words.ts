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
- Refer to businesses only by their codes as given (BUSINESS, COMPETITOR 1, ...). No websites, emails or phone numbers.
- Plain, confident English a business owner understands. No hype, no guarantees.
- If the data is thin, say less.`;

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
        rankings: { type: "string" },
        footprint: { type: "string" },
        competitors: { type: "string" },
        keywords: { type: "string" },
        revenue: { type: "string" },
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
export function wordsInput(block: Obj, company: string, niche: string): WordsInput {
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
    },
  };
}

/** Claude's answer → the words fields of the results block, with names put back. */
export function applyWords(block: Obj, answer: unknown, codes: [string, string][]): Obj {
  const a = obj(answer);
  const named = (t: unknown, max: number) => {
    if (typeof t !== "string") return "";
    let s = t;
    // Longest codes first, so "COMPETITOR 10" isn't half-replaced by "COMPETITOR 1".
    for (const [c, n] of [...codes].sort((x, y) => y[0].length - x[0].length)) s = s.split(c).join(n);
    return s.slice(0, max);
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
