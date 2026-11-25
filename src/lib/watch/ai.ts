// AI Search Watch (docs/AI_VISIBILITY_PLAN.md, Phase G1): "do ChatGPT, Gemini and Google's
// AI Overview name our client?" Pure, tested code only. No network, no database, no AI.
//
// An "answer" is what one AI engine said to one question on one try. Answers are UNTRUSTED
// text: this module only searches them for names and websites, never follows anything in
// them, and keeps at most a short, cleaned excerpt (phones and emails removed).
// Deciding "mentioned or not" is plain string matching, so no AI judges the answers.

import { domainOf, NAME_STOP_WORDS } from "@/lib/scout";
import { RUN_RULES } from "@/lib/audit/run";
import { trendOf, type Trend, type WatchClient, type WatchKeyword, type WatchMarket } from "./compute";

/** Tunable numbers (see the plan, section 3 and 5). */
export const AI_WATCH_RULES = {
  /** Each question is asked this many times per round on engines whose answers vary. */
  tries: 3,
  /** Google's AI Overview is steadier: one search per question per round. */
  overviewTries: 1,
  maxQuestions: 10,
  questionMin: 8,
  questionMax: 160,
  /** A score is only shown with at least this many answered tries. */
  minTries: 6,
  excerptChars: 300,
  maxCompetitors: 10,
  /** A question × engine counts as a win/loss when "mentioned" tries move by this many. */
  winSwing: 2,
  /** A name of one word (after cleaning) is too easy to match by accident ("Premier"). */
  minNameWords: 2,
  /** Domain stems shorter than this are not matched as words (too many false hits). */
  minStemChars: 6,
} as const;

export const AI_ENGINES = ["chatgpt", "gemini", "ai_overview", "perplexity", "claude"] as const;
export type AiEngine = (typeof AI_ENGINES)[number];

export const AI_ENGINE_LABEL: Record<AiEngine, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  ai_overview: "Google AI Overview",
  perplexity: "Perplexity",
  claude: "Claude",
};

/**
 * DataForSEO prices in dollars per answer (checked 2026-11-25 on dataforseo.com).
 * null = not published per model (LLM Responses: a small fee + the AI provider's charge);
 * the estimate then uses `unknownWorstUsd`, deliberately high, until a test round measures it.
 */
export const AI_PRICE_USD: Record<AiEngine, number | null> = {
  chatgpt: 0.004, // LLM Scraper, live
  gemini: 0.004, // LLM Scraper, live
  ai_overview: 0.002, // Google organic results (top 10 + the AI Overview block)
  perplexity: null,
  claude: null,
};
export const AI_UNKNOWN_WORST_USD = 0.03;

export interface AiQuestion {
  id: string;
  clientId: string;
  text: string;
  city: string;
  state: string;
}

/** One engine's answer to one question on one try (what the checker hands over). */
export interface AiAnswer {
  questionId: string;
  engine: AiEngine;
  tryNo: number;
  date: string; // YYYY-MM-DD, the round's date
  /** "error" = the engine didn't answer: counts as NOT CHECKED, never as "not mentioned". */
  status: "ok" | "error";
  text: string;
  /** Source links the engine showed. */
  citations: string[];
  source: string;
}

/** A competitor we know by website (Watcher's list), optionally with its business name. */
export interface AiCompetitor {
  clientId: string;
  domain: string;
  name?: string | null;
}

/** What gets stored per answer (the full answer text is not kept). */
export interface AiCheck {
  questionId: string;
  engine: AiEngine;
  tryNo: number;
  date: string;
  checked: boolean;
  mentioned: boolean;
  /** Place in the answer's list (1 = first), null = not a list or not named in it. */
  place: number | null;
  cited: boolean;
  /** Known competitors' domains named in this answer. */
  competitors: string[];
  /** Other business websites the engine cited ("found in answers"), directories left out. */
  foundDomains: string[];
  excerpt: string | null;
  source: string;
}

// ------------------------------------------------------------------ text cleaning

/** Lower case, "&" → "and", only letters and digits, single spaces, padded with spaces. */
export function cleanWords(s: string): string {
  return ` ${s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** A business name ready for matching: "(fictional)"-style notes and LLC/Inc/the… dropped. */
export function nameForMatch(name: string): string {
  let t = cleanWords(name.replace(/\([^)]*\)/g, " "));
  for (const w of NAME_STOP_WORDS) t = t.split(` ${w} `).join(" ");
  return t.replace(/\s+/g, " ").trim();
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

/** Removes email addresses and phone numbers, control characters, and squeezes spaces. */
export function scrub(s: string): string {
  return s
    .replace(EMAIL, "[email removed]")
    .replace(PHONE, "[phone removed]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "pipeline-pros.example" → "pipeline pros" (the part before the first dot, as words). */
export function domainStem(domain: string): string {
  return domain.split(".")[0]!.replace(/[^a-z0-9]+/g, " ").trim();
}

const isDirectory = (d: string) => RUN_RULES.directories.some((x) => d === x || d.endsWith(`.${x}`));

// ------------------------------------------------------------------ matching

export interface Matcher {
  domain: string | null;
  /** Cleaned name (several words), or null when too short to match safely. */
  name: string | null;
  /** Domain stem without spaces, e.g. "rapidrooter" (matched against joined words). */
  stem: string | null;
}

export function matcherFor(b: { name?: string | null; domain?: string | null }): Matcher {
  const domain = domainOf(b.domain ?? null);
  const n = b.name ? nameForMatch(b.name) : "";
  const name = n && n.split(" ").length >= AI_WATCH_RULES.minNameWords ? n : null;
  const s = domain ? domainStem(domain).replace(/\s+/g, "") : "";
  const stem = s.length >= AI_WATCH_RULES.minStemChars ? s : null;
  return { domain, name, stem };
}

/** Where in the text the business is first named, or -1. Works on the original text. */
export function findMention(text: string, m: Matcher): number {
  const lower = text.toLowerCase();
  let best = -1;
  const take = (i: number) => {
    if (i >= 0 && (best === -1 || i < best)) best = i;
  };
  if (m.domain) take(lower.indexOf(m.domain));
  if (m.name) {
    // Match the cleaned name as whole words; map the hit back to roughly the same spot.
    const words = cleanWords(text);
    const at = words.indexOf(` ${m.name} `);
    if (at >= 0) take(approxIndex(lower, m.name.split(" ")[0]!));
  }
  if (m.stem) {
    const words = cleanWords(text).trim().split(" ");
    for (let i = 0; i < words.length; i++) {
      let joined = "";
      for (let n = 0; n < 4 && i + n < words.length; n++) {
        joined += words[i + n];
        if (joined === m.stem) {
          take(approxIndex(lower, words[i]!));
          break;
        }
        if (joined.length >= m.stem.length) break;
      }
      if (best >= 0) break;
    }
  }
  return best;
}

function approxIndex(lower: string, firstWord: string): number {
  const i = lower.indexOf(firstWord);
  return i >= 0 ? i : 0;
}

/** True when the domain (or a sub-domain of it) is among the cited links. */
export function isCited(citations: string[], domain: string | null): boolean {
  if (!domain) return false;
  return citations.some((c) => {
    const d = domainOf(c);
    return d !== null && (d === domain || d.endsWith(`.${domain}`));
  });
}

const LIST_ITEM = /^\s*(?:\d{1,2}[.)]|[-*•])\s+/;

/** The 1-based place of the business in the answer's list, or null (not a list / not in it). */
export function listPlace(text: string, m: Matcher): number | null {
  const items = text.split(/\r?\n/).filter((l) => LIST_ITEM.test(l));
  if (items.length < 2) return null;
  const i = items.findIndex((l) => findMention(l, m) >= 0);
  return i >= 0 ? i + 1 : null;
}

/** A short, cleaned excerpt around a position. */
export function excerptAt(text: string, at: number, chars: number = AI_WATCH_RULES.excerptChars): string {
  const half = Math.floor(chars / 2);
  const start = Math.max(0, at - half);
  const cut = text.slice(start, start + chars);
  const cleaned = scrub(cut).slice(0, chars);
  return `${start > 0 ? "…" : ""}${cleaned}${start + chars < text.length ? "…" : ""}`;
}

/** Turns one answer into the facts we store. */
export function checkAnswer(answer: AiAnswer, client: Pick<WatchClient, "name" | "domain">, competitors: AiCompetitor[]): AiCheck {
  const base = { questionId: answer.questionId, engine: answer.engine, tryNo: answer.tryNo, date: answer.date, source: answer.source };
  if (answer.status !== "ok") {
    return { ...base, checked: false, mentioned: false, place: null, cited: false, competitors: [], foundDomains: [], excerpt: null };
  }
  const text = answer.text.slice(0, 20_000);
  const citations = answer.citations.slice(0, 50);
  const me = matcherFor(client);
  const at = findMention(text, me);
  const cited = isCited(citations, me.domain);
  const mentioned = at >= 0 || cited;

  const named: string[] = [];
  for (const c of competitors) {
    const m = matcherFor(c);
    if (!m.domain || m.domain === me.domain) continue;
    if (findMention(text, m) >= 0 || isCited(citations, m.domain)) named.push(m.domain);
    if (named.length >= AI_WATCH_RULES.maxCompetitors) break;
  }
  const known = new Set([me.domain, ...competitors.map((c) => domainOf(c.domain))]);
  const found = [
    ...new Set(
      citations
        .map((c) => domainOf(c))
        .filter((d): d is string => d !== null && !known.has(d) && !isDirectory(d) && ![...known].some((k) => k && d.endsWith(`.${k}`))),
    ),
  ].slice(0, AI_WATCH_RULES.maxCompetitors);

  return {
    ...base,
    checked: true,
    mentioned,
    place: mentioned ? listPlace(text, me) : null,
    cited,
    competitors: named,
    foundDomains: found,
    excerpt: at >= 0 ? excerptAt(text, at) : null,
  };
}

// ------------------------------------------------------------------ scores and summaries

export interface EngineTally {
  engine: AiEngine;
  mentioned: number;
  checked: number;
}

/** Share of answered tries that named the client, 0–100; null below `minTries`. */
export function aiScore(checks: AiCheck[]): number | null {
  const done = checks.filter((c) => c.checked);
  if (done.length < AI_WATCH_RULES.minTries) return null;
  return Math.round((done.filter((c) => c.mentioned).length / done.length) * 100);
}

export function tallyByEngine(checks: AiCheck[], engines: readonly AiEngine[]): EngineTally[] {
  return engines.map((engine) => {
    const mine = checks.filter((c) => c.engine === engine && c.checked);
    return { engine, mentioned: mine.filter((c) => c.mentioned).length, checked: mine.length };
  });
}

export interface InsteadOf {
  domain: string;
  /** Tries where they were named and our client wasn't. */
  times: number;
  known: boolean;
}

/** Who the engines named when they didn't name our client (most often first). */
export function recommendedInstead(checks: AiCheck[], limit = 5): InsteadOf[] {
  const count = new Map<string, InsteadOf>();
  for (const c of checks) {
    if (!c.checked || c.mentioned) continue;
    for (const d of c.competitors) count.set(d, { domain: d, times: (count.get(d)?.times ?? 0) + 1, known: true });
    for (const d of c.foundDomains) if (!count.has(d) || !count.get(d)!.known) count.set(d, { domain: d, times: (count.get(d)?.times ?? 0) + 1, known: false });
  }
  return [...count.values()].sort((a, b) => b.times - a.times || a.domain.localeCompare(b.domain)).slice(0, limit);
}

/** Round dates in order (oldest first). */
export function aiRounds(checks: AiCheck[]): string[] {
  return [...new Set(checks.map((c) => c.date))].sort();
}

export interface AiChange {
  questionId: string;
  engine: AiEngine;
  from: number;
  to: number;
  tries: number;
  kind: "win" | "loss";
}

/** Question × engine pairs whose "mentioned" count moved by at least `winSwing` between two rounds. */
export function aiChanges(checks: AiCheck[], fromDate: string, toDate: string): AiChange[] {
  const key = (c: AiCheck) => `${c.questionId}|${c.engine}`;
  const tally = (date: string) => {
    const m = new Map<string, { yes: number; n: number; c: AiCheck }>();
    for (const c of checks) {
      if (c.date !== date || !c.checked) continue;
      const t = m.get(key(c)) ?? { yes: 0, n: 0, c };
      t.yes += c.mentioned ? 1 : 0;
      t.n += 1;
      m.set(key(c), t);
    }
    return m;
  };
  const before = tally(fromDate);
  const after = tally(toDate);
  const out: AiChange[] = [];
  for (const [k, a] of after) {
    const b = before.get(k);
    if (!b) continue;
    const diff = a.yes - b.yes;
    const swing = Math.min(AI_WATCH_RULES.winSwing, a.n);
    if (Math.abs(diff) >= swing && diff !== 0) out.push({ questionId: a.c.questionId, engine: a.c.engine, from: b.yes, to: a.yes, tries: a.n, kind: diff > 0 ? "win" : "loss" });
  }
  return out.sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from) || x.questionId.localeCompare(y.questionId));
}

// ------------------------------------------------------------------ questions

/**
 * Suggested questions from the client's money keywords × cities (a person picks and edits).
 * Never invents services: only keywords already on the client's Watcher list.
 */
export function suggestQuestions(keywords: WatchKeyword[], markets: WatchMarket[], limit: number = AI_WATCH_RULES.maxQuestions): string[] {
  const kws = [...keywords].sort((a, b) => Number(b.money) - Number(a.money)).map((k) => k.keyword.replace(/\bnear me\b/i, "").trim()).filter(Boolean);
  const out: string[] = [];
  const add = (q: string) => {
    if (!out.includes(q) && out.length < limit) out.push(q);
  };
  for (const m of markets) {
    for (const k of kws) add(`Who is the best ${k} in ${m.city}, ${m.state}?`);
  }
  for (const m of markets) {
    for (const k of kws) add(`Which ${k} company in ${m.city}, ${m.state} has the best reviews?`);
  }
  return out;
}

/** Checks a question someone typed. Returns the cleaned text, or a plain-English problem. */
export function checkQuestion(raw: string): { ok: true; text: string } | { ok: false; problem: string } {
  const text = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < AI_WATCH_RULES.questionMin) return { ok: false, problem: "Too short: write it the way a customer would ask." };
  if (text.length > AI_WATCH_RULES.questionMax) return { ok: false, problem: `Too long: keep it under ${AI_WATCH_RULES.questionMax} characters.` };
  if (new RegExp(EMAIL.source, "i").test(text)) return { ok: false, problem: "Leave out email addresses." };
  if (new RegExp(PHONE.source).test(text)) return { ok: false, problem: "Leave out phone numbers." };
  if (/https?:\/\/|www\./i.test(text)) return { ok: false, problem: "Leave out links: ask it the way a customer would." };
  return { ok: true, text };
}

// ------------------------------------------------------------------ costs

export interface AiCostEstimate {
  /** Worst case in dollars (unknown prices counted high). */
  usd: number;
  answers: number;
  /** Engines whose price is a guess until a test round measures it. */
  guessed: AiEngine[];
}

export function aiRoundCost(questions: number, engines: readonly AiEngine[], tries: number = AI_WATCH_RULES.tries): AiCostEstimate {
  let usd = 0;
  let answers = 0;
  const guessed: AiEngine[] = [];
  const q = Math.max(0, Math.floor(questions));
  for (const e of engines) {
    const n = q * (e === "ai_overview" ? AI_WATCH_RULES.overviewTries : Math.max(1, Math.floor(tries)));
    const price = AI_PRICE_USD[e];
    if (price === null) guessed.push(e);
    usd += n * (price ?? AI_UNKNOWN_WORST_USD);
    answers += n;
  }
  return { usd: Math.round(usd * 100) / 100, answers, guessed };
}

// ------------------------------------------------------------------ board

export interface AiData {
  questions: AiQuestion[];
  answers: AiAnswer[];
  competitors: AiCompetitor[];
  engines: readonly AiEngine[];
}

export interface AiQuestionRow {
  question: AiQuestion;
  cells: { engine: AiEngine; mentioned: number; checked: number; bestPlace: number | null; cited: boolean }[];
  excerpt: { engine: AiEngine; text: string } | null;
}

export interface AiClientView {
  client: WatchClient;
  score: number | null;
  prevScore: number | null;
  series: (number | null)[];
  trend: Trend;
  engines: EngineTally[];
  citedTries: number;
  instead: InsteadOf[];
  changes: (AiChange & { question: string })[];
  rows: AiQuestionRow[];
}

export interface AiBoard {
  rounds: string[];
  latest: string | null;
  clients: AiClientView[];
  /** Across all clients, latest round. */
  instead: InsteadOf[];
}

export function buildAiBoard(clients: WatchClient[], ai: AiData): AiBoard {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const qById = new Map(ai.questions.map((q) => [q.id, q]));
  const checks: AiCheck[] = [];
  for (const a of ai.answers) {
    const q = qById.get(a.questionId);
    const client = q ? byId.get(q.clientId) : undefined;
    if (!q || !client) continue;
    checks.push(checkAnswer(a, client, ai.competitors.filter((c) => c.clientId === client.id)));
  }
  const rounds = aiRounds(checks);
  const latest = rounds.at(-1) ?? null;
  const prev = rounds.at(-2) ?? null;
  const clientOf = (c: AiCheck) => qById.get(c.questionId)!.clientId;

  const views: AiClientView[] = [];
  for (const client of clients) {
    const mine = checks.filter((c) => clientOf(c) === client.id);
    if (mine.length === 0) continue;
    const at = (d: string | null) => (d ? mine.filter((c) => c.date === d) : []);
    const now = at(latest);
    const series = rounds.map((d) => aiScore(at(d)));
    const questions = ai.questions.filter((q) => q.clientId === client.id);
    const rows: AiQuestionRow[] = questions.map((question) => {
      const qc = now.filter((c) => c.questionId === question.id);
      const cells = ai.engines.map((engine) => {
        const ec = qc.filter((c) => c.engine === engine && c.checked);
        const places = ec.map((c) => c.place).filter((p): p is number => p !== null);
        return { engine, mentioned: ec.filter((c) => c.mentioned).length, checked: ec.length, bestPlace: places.length ? Math.min(...places) : null, cited: ec.some((c) => c.cited) };
      });
      const ex = qc.find((c) => c.excerpt);
      return { question, cells, excerpt: ex ? { engine: ex.engine, text: ex.excerpt! } : null };
    });
    views.push({
      client,
      score: aiScore(now),
      prevScore: aiScore(at(prev)),
      series,
      trend: trendOf(series),
      engines: tallyByEngine(now, ai.engines),
      citedTries: now.filter((c) => c.cited).length,
      instead: recommendedInstead(now),
      changes: prev && latest ? aiChanges(mine, prev, latest).map((ch) => ({ ...ch, question: qById.get(ch.questionId)!.text })) : [],
      rows,
    });
  }
  views.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.client.name.localeCompare(b.client.name));
  return { rounds, latest, clients: views, instead: recommendedInstead(checks.filter((c) => c.date === latest), 8) };
}
