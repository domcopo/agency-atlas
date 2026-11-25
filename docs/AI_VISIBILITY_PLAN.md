# Plan: AI Search Watch ("do ChatGPT and Google's AI recommend our clients?")

Status: **plan only, waiting for the owner's approval (written 2026-11-25).** Nothing has been built, no migration has been written, and no money has been spent.

Builds on SEO Watcher (`docs/SEO_WATCHER_PLAN.md`: watched clients, lists, rounds, caps) and the in-app DataForSEO module from Run audit (`docs/AUDIT_RUN_PLAN.md`, `src/lib/audit/sources/dataforseo.ts`). The rules are the same as the rest of Atlas: every figure has a source and a date, a missing value shows as "not found", the app never sends anything, and GoHighLevel isn't involved.

## Why build this

- **Clients are asking for it.** In AgencyAnalytics' 2026 benchmark survey of 494 agencies, 66% said "help us show up in AI search" is the top new service clients ask for. Agencies say their weak spot is **measuring** it.
- **We can sell it.** Agencies price standalone "AI visibility" retainers at about $1,500–5,000 a month. Our clients are smaller, so a more realistic option is an add-on or a top-tier feature. The owner sets the price; Atlas never shows prices to clients on its own.
- **It's cheap to run.** The data costs a fraction of a cent per question (see Costs).
- **It fits Atlas's rules.** It only reads public data, works out the numbers in plain tested code, and produces a report a person checks and sends.
- **It reuses what exists:** watched clients, competitors, cities, rounds, the spending caps, the DataForSEO module and the (planned) monthly report.

Today Atlas only has an optional "AI search check" page in the sales audit (`src/lib/audit/sections.ts`, `ai_search`). It's off by default, runs through a copy-and-paste prompt, and is a one-off for prospects. Nothing tracks **existing clients month to month**.

## How it works (one picture)
```
Per watched client           Each round (monthly)                Stored (add-only)            What you see
"AI questions" list    ──▶   ask each question on each AI   ──▶  one row per question ×  ──▶  AI score + trend, which
e.g. "best plumber in        engine, 3 times (answers vary)      engine × try: mentioned?      engines mention them, who
Youngstown OH"               via DataForSEO (read-only)          place in list? cited site?    gets recommended instead,
+ competitors (Watcher)      + Google AI Overview (one Google      which competitors?            report page, upsell hint
                             search from the client's city)       short evidence excerpt
```
Plain, tested code decides whether a client or competitor was mentioned (name or website match). **No AI is used to judge the answers**, so this costs nothing from the Claude budget and can't be talked into a wrong result.

## 1. What people see

**Where:** a new **"AI search"** tab inside SEO Watcher (`/growth/watcher/ai`), plus a section on each watched client's page.

| | Owner | Managers | Developers | Salespeople |
|---|---|---|---|---|
| AI search board, all watched clients | yes | yes | only clients they have work on, no costs | no |
| Edit a client's AI questions | yes | yes | no | no |
| Start a round, see costs | yes | yes (costs: see only) | no | no |

These are the same rules as Watcher, enforced by the database (RLS), not by hiding buttons.

**Board:**
- **AI score per client** (0–100): the share of all tries where an engine recommended or named the client. Shown with its trend (▲▼) and a sparkline.
- **By engine:** ChatGPT · Gemini · Google AI Overview (+ Perplexity/Claude if turned on), each shown as "mentioned in 7 of 30 tries".
- **Who gets recommended instead:** the competitors named most often in answers where our client wasn't. This works even for competitors not yet on the client's list, but it's labeled "found in answers".
- **Wins and losses:** "Now named by Gemini for *emergency plumber Boardman OH* (0/3 → 3/3)".

**Per client:** each question with its result for every engine, the place in the list when the answer is a list, whether the client's website was **cited as a source**, and a short excerpt as evidence. A person can open the full answer for that round only; it isn't kept (see section 4).

## 2. The AI questions

- **Up to 10 per client** (owner can change). Each one is the kind of thing a customer types, **with the city in the words**, because DataForSEO doesn't say these engines can be pointed at a city.
- **Suggested for you, not invented:** Atlas builds suggestions from the client's money keywords × cities that are already in Watcher (templates like "best {service} in {city} {state}", "who is the most trusted {service} company near {city}", "{service} {city} reviews"). A person picks and edits them.
- **Questions are checked:** plain text, length-limited, and no phone numbers, emails or people's names (same check as Scout).

## 3. Data sources and costs

Prices are from dataforseo.com, checked 2026-11-25: no subscription, no monthly minimum, top-ups from $50. The app shows its own worst-case estimate before each round, and the first test round confirms the real numbers.

| Engine | DataForSEO product | Price | Notes |
|---|---|---|---|
| **ChatGPT** | LLM Scraper (live) | **$0.004** per answer | Reads what the ChatGPT app shows, which is closer to what a customer sees |
| **Gemini** | LLM Scraper (live) | **$0.004** per answer | Same |
| **Google AI Overview** | Google organic results (already allowlisted) | **~$0.002** per question | One Google search per question **from the client's city** (`/serp/google/organic/live/advanced` includes the AI Overview block when Google shows one). This is the one engine where the city is real. Not repeated 3 times (Google is steadier). |
| Perplexity, Claude (optional) | LLM Responses (live) | from $0.0006 per question **+ the AI provider's own charge** | Not priced per model on their site, so it must be measured on a test round. These answers come from the API, which can differ from the consumer app |
| (Not used) LLM Mentions | $0.10 per request + $0.001 per row | Built for big brands; small local businesses will mostly show zero. Could help sales audits later |

**Example: 12 watched clients × 10 questions × 3 tries, ChatGPT + Gemini, monthly**
= 720 answers × $0.004 ≈ $2.90, plus 120 AI Overview searches × ~$0.002 ≈ $0.25 → **about $3.15 a month**.
- Weekly instead of monthly: ≈ $12.50 a month.
- Adding Perplexity + Claude: unknown until measured; probably a few dollars more.

**Why 3 tries:** AI answers change from one ask to the next. One try can mislead; "named in 2 of 3" is honest. The number is set in `AI_WATCH_RULES`.

**Caps:** this uses Watcher's existing database-enforced cap and ledger (`watch_spend`, a new kind `ai_search`). The worst-case estimate is written **before** a round, and the database refuses a round that would go over. See Q3: share the $20 Watcher cap or add a separate one.

**Missing pieces in the data (be honest with clients):**
- No ChatGPT/Gemini results by city.
- No Google **AI Mode** and no Microsoft **Copilot** from DataForSEO today.
- These are samples of what the engines say, not every answer every customer gets.

## 4. Stored data (new migration, next free number at build time; today `0037`)

| Table | What it holds | Who writes |
|---|---|---|
| `watch_ai_questions` | watched client, question text, city/state, active, created by | owner/managers |
| `watch_ai_checks` | **add-only**: question, engine, try number, round, date, client mentioned (yes/no), place in list (null = not a list / not named), client website cited (yes/no), competitors named (websites/names, max 10), excerpt (max 300 characters around the mention, phones and emails removed), source, retrieved | the round (in the app, through the checker) |
| `watch_runs`, `watch_spend` | existing; add kind `ai_search` | existing rules |

- **Full answers are not stored.** Only the yes/no facts, the list place, cited websites and one short excerpt are kept. AI answers can contain people's names (business owners, reviewers), so keeping less is safer.
- **Every table:** RLS, the restrictive two-factor (`aal2`) rule, minimum grants, and break-in tests in `supabase/tests/10_rls_break_in.sql`. Salespeople can't read anything. Developers can read only their own clients' rows. Nobody can edit or delete checks or the ledger. The cap can't be passed even by calling the database directly.
- **The app works before the migration is run:** the tab says "needs 00NN", and the sample preview still works.

## 5. Matching: "did the AI mention our client?" (pure, tested: `src/lib/watch/ai.ts`)

- **Mentioned** = the answer contains the client's business name (cleaned the same way as Scout's `nameKey`: case, "LLC", "&"/"and", punctuation) **or** their website domain.
- **Cited** = the client's domain appears in the answer's source links.
- **Place in list** = when the answer is a numbered or bulleted list, the client's position in it.
- **Competitors** = the same matching against Watcher's competitor list, plus any business websites in the source links ("found in answers").
- **AI score** = mentioned tries ÷ all tries, over the chosen engines, for the round. It's only shown when there are at least `AI_WATCH_RULES.minTries` tries.
- **Edge cases tested:** a name that's also a common word ("Premier Plumbing"), a client with no website, an engine error (it counts as "not checked", never as "not mentioned"), empty answers, and very long answers.

## 6. In the monthly client report (Watcher Phase D)

One added page, **"Showing up in AI search"**, shows:
- the AI score and its change;
- which engines named them;
- 2–3 example questions with their results;
- who was recommended instead;
- what we're doing about it (written by a person).

It is labeled as a sample of AI answers on the dates shown.

The **upsell rule** (`upsellDue`) gains one optional "next step": "AI visibility work" when the client is strong on Google but rarely named by AI engines.

## 7. Phases (each one checked and approved before the next)

- **G1. Screens on sample data.** Pure matching and score code with tests, the board and the client section on fictional data (`src/fixtures/watch-sample.ts` gains AI answers for the 6 fictional businesses). No database, no network, **$0**.
- **G2. Real questions + in-app rounds.**
  - Migration, question lists with suggestions, and a round that asks the engines itself.
  - This means adding **2–3 read-only addresses** to the DataForSEO allowlist: the LLM Scraper live lookups for ChatGPT and Gemini (the exact paths are confirmed from DataForSEO's docs before building). It uses the same module, login and POST exception the owner already approved for Run audit.
  - Plus AI Overview read from one Google search per question (that lookup is already allowlisted).
  - About **$3 a month** at the example size.
- **G3. Report page + upsell hint** (lands with Watcher Phase D).
- **G4 (optional).** Perplexity/Claude via LLM Responses after a measured test; and making the sales audit's "AI search check" use the same in-app code instead of the copy-and-paste prompt.

A copy-and-paste-in-Claude-Code route (like Watcher Phase B) isn't planned: the in-app DataForSEO module already exists and is cheaper to keep consistent. It can be added if the owner wants a route that needs no new allowlist addresses.

## 8. Files

- **New:**
  - `src/lib/watch/ai.ts`: matching, score, question suggestions, `AI_WATCH_RULES`, the round's cost estimate.
  - `src/lib/watch/ai-intake.ts`: strict checker for engine answers. It drops malformed data, cuts lengths, removes phones and emails, and never treats answer text as instructions.
  - `src/components/watcher/AiSearch*.tsx`
  - `src/app/(app)/growth/watcher/ai/` (board, preview)
  - `tests/watch-ai.test.ts`
- **Changed:**
  - `src/lib/audit/sources/dataforseo.ts` (allowlist +2–3 paths);
  - the end of `src/app/actions.ts` (edit questions, start an AI round; each starts with `notWhilePreviewing()`);
  - the end of `src/lib/data-source.ts`;
  - `tests/guardrails.test.ts` (pin the new allowlist entries);
  - `supabase/tests/10_rls_break_in.sql`;
  - the Watcher board link;
  - `CLAUDE.md`.
- **Not touched:** `src/lib/ghl/`, billing, `src/lib/ai/` (no Claude calls), audit tables.

## 9. Risks and things to review

- **AI answers are random and change often.** Repeat tries, label everything "sampled on [date]", and never promise a client a spot in ChatGPT.
- **Coverage gaps:** there's no city targeting for ChatGPT/Gemini, and no AI Mode or Copilot. Reports must say which engines were checked.
- **Name matching can be wrong** (common-word names, two businesses with similar names). The excerpt is shown as evidence so a person can spot mistakes; tests cover the known traps.
- **Answer text is untrusted.** It's checked field by field, shown as plain text, kept short and never used as instructions.
- **Privacy (flagged for the owner's review):** questions contain clients' services and towns (public business info) and go to DataForSEO, the same as Watcher today. Answers can name real people, so only short, cleaned excerpts are stored. Competitor data is public business info, kept minimal.
- **Costs:** small, but they grow with clients × questions × tries × engines. The database cap stops surprises, and the LLM Responses cost is unknown until measured.
- **Overlap:** touches `actions.ts`, `data-source.ts`, the DataForSEO module and the break-in tests. There are uncommitted changes on `main` in some of those files today, so build this after those land.

## 10. How it will be tested

- Unit tests with recorded, **fictional** engine answers (no real calls in tests): matching, score, edge cases, cost estimate, the checker refusing bad data.
- Guardrail tests: only the DataForSEO module calls out, only allowlisted paths, no Claude calls from Watcher AI code.
- Break-in tests for the new table(s).
- One real round on **one** watched client with the owner watching, with the cost compared against DataForSEO's dashboard.

## Done means (G1 + G2)

- The AI search tab shows a score, engines and "recommended instead" for watched clients, from a real round, within the cap.
- Every figure shows its engine and date, and engine errors show as "not checked".
- `npm run check` and `npm run test:rls` pass.

## Questions for the owner

1. **Engines to start with:** ChatGPT + Gemini + Google AI Overview (recommended: cheap, close to what customers see), or also Perplexity/Claude after a measured test?
2. **How often:** monthly (recommended, ≈ $3 at 12 clients), or weekly (≈ $12.50)?
3. **Cap:** share Watcher's $20/month cap, or give AI search its own (e.g. $10/month)?
4. **Questions per client:** 10 by default, written by owner/managers from Atlas's suggestions. OK?
5. **Selling it:** include it in the top tier, sell it as an add-on, or use it internally first? This only changes the report wording, not the build.
6. **OK to add the 2–3 read-only DataForSEO addresses** to the existing allowlist in G2?
