// AI Search Watch sample (docs/AI_VISIBILITY_PLAN.md, Phase G1): FICTIONAL answers from
// AI engines about the SEO Watcher sample's made-up businesses. Nothing was fetched and
// nothing cost money. Used only for the preview screen; never mixed with real clients.
// Generated from a fixed seed, so the preview looks the same every time.

import type { AiAnswer, AiCompetitor, AiEngine, AiQuestion } from "@/lib/watch/ai";
import { suggestQuestions } from "@/lib/watch/ai";
import { AI_WATCH_RULES } from "@/lib/watch/ai";
import { watchSample } from "./watch-sample";

export const AI_SAMPLE_ENGINES: readonly AiEngine[] = ["chatgpt", "gemini", "ai_overview"];
export const AI_SAMPLE_ROUNDS = ["2026-08-23", "2026-09-23", "2026-10-23", "2026-11-23"] as const;

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Business names the made-up engines use for the sample's competitor websites. */
const COMPETITOR_NAMES: Record<string, string> = {
  "rapidrooter.example": "Rapid Rooter",
  "pipeline-pros.example": "Pipeline Pros Plumbing",
  "buckeyedrains.example": "Buckeye Drains",
  "summit-shingle.example": "Summit Shingle Co.",
  "topline-roofs.example": "Topline Roofs",
  "lakeshore-exteriors.example": "Lakeshore Exteriors",
  "three-rivers-air.example": "Three Rivers Air",
  "steelcity-comfort.example": "SteelCity Comfort",
  "allegheny-hvac.example": "Allegheny HVAC",
  "circle-city-electric.example": "Circle City Electric",
  "hoosier-wiring.example": "Hoosier Wiring",
  "brightline-electric.example": "Brightline Electric",
  "bluegrass-green.example": "Bluegrass Green",
  "derby-lawns.example": "Derby Lawns",
  "riverbend-yards.example": "Riverbend Yards",
  "queen-city-smiles.example": "Queen City Smiles",
  "carolina-family-dental.example": "Carolina Family Dental",
  "southpark-dentistry.example": "SouthPark Dentistry",
};

/**
 * Chance (0–1) that each made-up engine names the client, per round (oldest first).
 * Plumbing is rising, roofing slipping, landscaping never named, so every case shows.
 */
const ODDS: Record<string, Record<AiEngine, number[]>> = {
  "w-plumb": { chatgpt: [0.15, 0.3, 0.5, 0.75], gemini: [0.1, 0.2, 0.35, 0.6], ai_overview: [0, 0, 1, 1], perplexity: [], claude: [] },
  "w-roof": { chatgpt: [0.8, 0.7, 0.5, 0.3], gemini: [0.7, 0.6, 0.4, 0.25], ai_overview: [1, 1, 0, 0], perplexity: [], claude: [] },
  "w-hvac": { chatgpt: [0.1, 0.1, 0.15, 0.1], gemini: [0, 0.1, 0.1, 0.1], ai_overview: [0, 0, 0, 0], perplexity: [], claude: [] },
  "w-elec": { chatgpt: [0.8, 0.85, 0.8, 0.85], gemini: [0.7, 0.75, 0.8, 0.8], ai_overview: [1, 1, 1, 1], perplexity: [], claude: [] },
  "w-lawn": { chatgpt: [0, 0, 0, 0], gemini: [0, 0, 0, 0], ai_overview: [0, 0, 0, 0], perplexity: [], claude: [] },
  "w-dental": { chatgpt: [0.3, 0.35, 0.4, 0.5], gemini: [0.2, 0.3, 0.3, 0.4], ai_overview: [0, 1, 0, 1], perplexity: [], claude: [] },
};

const REASONS = ["strong reviews and fast response times", "upfront pricing", "family-owned with a long local history", "24/7 emergency service", "well rated for clean, careful work"];

function build() {
  const rnd = seeded(20261125);
  const questions: AiQuestion[] = [];
  const answers: AiAnswer[] = [];
  const competitors: AiCompetitor[] = watchSample.competitors.map((c) => ({ ...c, name: COMPETITOR_NAMES[c.domain] ?? null }));

  for (const client of watchSample.clients) {
    const markets = watchSample.markets.filter((m) => m.clientId === client.id);
    const first = markets[0]!;
    const texts = suggestQuestions(
      watchSample.keywords.filter((k) => k.clientId === client.id),
      markets,
      3,
    );
    const shownName = client.name.replace(/\s*\([^)]*\)\s*/g, "").trim();
    const rivals = watchSample.competitors.filter((c) => c.clientId === client.id).map((c) => c.domain);

    texts.forEach((text, qi) => {
      const q: AiQuestion = { id: `${client.id}-q${qi + 1}`, clientId: client.id, text, city: first.city, state: first.state };
      questions.push(q);
      AI_SAMPLE_ROUNDS.forEach((date, ri) => {
        for (const engine of AI_SAMPLE_ENGINES) {
          const tries = engine === "ai_overview" ? AI_WATCH_RULES.overviewTries : AI_WATCH_RULES.tries;
          for (let t = 1; t <= tries; t++) {
            // One made-up engine error, so the "not checked" case shows.
            if (client.id === "w-hvac" && engine === "gemini" && ri === 3 && qi === 0 && t === 3) {
              answers.push({ questionId: q.id, engine, tryNo: t, date, status: "error", text: "", citations: [], source: "sample" });
              continue;
            }
            const named = rnd() < (ODDS[client.id]?.[engine]?.[ri] ?? 0);
            const picks = rivals.filter(() => rnd() < 0.7);
            if (picks.length === 0) picks.push(rivals[0]!);
            const names = picks.map((d) => COMPETITOR_NAMES[d] ?? d);
            if (named) names.splice(Math.min(names.length, Math.floor(rnd() * 3)), 0, shownName);
            const extra = rnd() < 0.3 ? "Citywide Home Pros" : null;
            if (extra) names.push(extra);
            const lines = names.map((n, i) => {
              const why = REASONS[Math.floor(rnd() * REASONS.length)]!;
              const phone = n === shownName && rnd() < 0.5 ? ` Call (614) 555-01${String(10 + i).padStart(2, "0")}.` : "";
              return `${i + 1}. **${n}**: ${why}.${phone}`;
            });
            const body =
              engine === "ai_overview"
                ? `Top-rated ${client.niche.toLowerCase()} options in ${first.city} include ${names.join(", ")}. Compare reviews and ask for written quotes.`
                : `Here are some well-reviewed ${client.niche.toLowerCase()} companies in ${first.city}, ${first.state}:\n\n${lines.join("\n")}\n\nIt's a good idea to compare a few quotes and check recent reviews.`;
            const citations = [
              ...picks.filter(() => rnd() < 0.6).map((d) => `https://${d}/`),
              ...(named && rnd() < 0.5 ? [`https://${client.domain}/services`] : []),
              ...(rnd() < 0.5 ? ["https://www.yelp.com/search"] : []),
              ...(extra ? ["https://citywide-home-pros.example/"] : []),
            ];
            answers.push({ questionId: q.id, engine, tryNo: t, date, status: "ok", text: body, citations, source: "sample" });
          }
        }
      });
    });
  }
  return { questions, answers, competitors, engines: AI_SAMPLE_ENGINES };
}

export const watchAiSample = build();
