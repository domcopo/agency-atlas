# Plan: Scout, a local prospect finder in Sales

Status: **approved 2026-11-24. S1 built and committed; `0024` run by the owner 2026-11-24.** Owner answers:
- **Home base:** Austintown, Ohio (the office). **Area:** Mahoning, Trumbull and Columbiana counties, or anything within **30 miles**. Later maybe an hour's drive, if the leads are good and it's worth it.
- **First kinds of business:** **construction companies and home-service businesses** (contractors, roofers, HVAC, plumbers, electricians, landscapers…). In other words, anyone we can rank high in local SEO, then grow into ads and scale.
- **Who runs scouts:** salespeople may run them too.
- **Phones:** no phone numbers in Atlas; calls go through the "Open in Google Maps" link.
- **What reps see:** their own prospects, and they can claim from a shared pool.
- **Caps:** **$25 a month** for Scout in total; **$10 a month per rep** inside that. Later, reps who hit and keep a good KPI and close rate can get more, and others get capped (a later change).
- **Migration:** Scout is **`0024`**. The Audits area + leaderboard plan moves to `0025`. `0023` was run by the owner.
- **Order:** after the audit builder (Phase A is built and its `0023` is run).

## What the owner asked for
- A **bot** that finds local businesses near us that are worth a visit or a call:
  - businesses that **spend on Google Ads**, maybe badly;
  - businesses that **rank low for SEO**.
- **Track those prospects** and **hand them to salespeople** for walk-ins (and calls).
- **Line up audits** for the ones who say yes.
- **Track results and success.**

## The idea in one picture
```
Scout run ──▶ Prospect list ──▶ Assigned to a salesperson ──▶ Walk-in / call ──▶ Interested? ──▶ Audit ──▶ Added to GoHighLevel ──▶ Won / lost
(the "bot")  (scored, with      (owner or manager)           (one-tap outcome,     │          (audit     (by the rep, by hand;  (read from
              reasons)                                        route in Google Maps) │          builder)   Atlas never writes)    GoHighLevel)
                                                                                    └─▶ Not now / Do not contact (remembered, never shown again)
```
Every step is counted, so the owner sees what works: which areas, which kinds of business, which signals (ads vs SEO), and which salesperson.

## 1. The Scout "bot": what it looks for
A **Scout run** is started by the owner, a manager **or a salesperson** (with their own cap, see Cost). You pick:
- **Where:** a home base (the office) and a radius, e.g. 10 miles, or a list of towns or ZIP codes.
- **What kinds of business:** e.g. plumbers, HVAC, roofers, dentists, med spas, lawyers. You choose the list; it's saved and reused.
- **How many:** e.g. 100 businesses for the first test.

The run shows its **estimated cost and the cap before it starts**. It then collects public data per business. Every figure keeps its **source and date**, like the audits.

| Signal | What it tells us | Where it comes from |
|---|---|---|
| **Runs Google Ads** | Shows up as a paid ad when someone searches "[service] near [town]"; estimated paid clicks/spend for their website | Google results for those searches + paid-traffic estimates (DataForSEO; Semrush optional) |
| **Ads probably not optimized** *(signs, not proof: we can't see their account)* | Ads send people to a slow page or the plain home page; site slow on phones; few reviews next to their ads; ads only on some of the obvious searches | The same searches + a page-speed check (Google Lighthouse) on the page the ad points to |
| **Ranks low for SEO** | Not in the Google Maps top 3 for their main service in their own town; competitors far ahead in reviews; little search traffic to the site | Google Maps results for "[service] [town]", business listing (rating, review count), traffic estimate |
| **No website / broken website** | Easiest pitch | Business listing + a quick check that the site loads |
| **Good for a walk-in** | Has a real storefront address (not a "service area only" listing), open hours, close to the base or to other prospects | Business listing |
| **Already ours** | Already a client, or already a lead in GoHighLevel → **left out automatically** | Our own client list and the GoHighLevel copy (matched by website or name) |

**Each prospect gets a score out of 100 with plain reasons**, e.g.:
> **78**, "Running Google Ads on 'plumber Akron' · ad goes to a page that loads in 6 s on phones · 3rd page in Maps · 14 reviews vs 160 for the top 3 · storefront 2.4 mi away"

These are free, plain rules (`SCOUT_RULES` in `src/lib/scout.ts`, tested), like the sales coach. The weights can be tuned.

**What is not collected:**
- owner or staff names;
- personal phone numbers or emails;
- anything that needs logging into someone else's account.

## 2. Prospect list: Sales → Scout
- **Owner and managers:**
  - the full list from every run, best score first, with filters (Ads spenders · Weak SEO · No website · Walk-in friendly · Not assigned · Town · Kind of business);
  - **Assign** one or many to a salesperson; **Skip** (hidden, with a reason).
- **Salespeople:**
  - **"My scout list"**: prospects assigned to them, plus ones they found in their own runs.
  - **"Shared pool"**: prospects nobody has yet, from the owner's and managers' runs. One tap, **Claim**, makes it theirs. Once claimed, other reps no longer see it. Only the owner or a manager can move it to someone else or back to the pool.
  - Their **Today's plan** gets a new group, **"Walk-ins today"**: up to N assigned prospects that haven't been visited, nearest together first.
- **Prospect page (`/sales/scout/[id]`):**
  - the score and reasons, each with its source and date;
  - the address and an **"Open in Google Maps"** link (Maps also has their call button);
  - the visit/call log, and the buttons below.

## 3. Walk-ins and calls
- **Plan a route:** tick up to 9 prospects → **"Open route in Google Maps"**.
  - The app orders them shortest-first and builds a normal Google Maps directions link, free.
  - Nothing is sent anywhere until the rep taps it, and then it's just Google Maps opening.
- **After a visit or call, one tap:**
  - Not in / closed;
  - Talked to staff;
  - Talked to the owner;
  - Not interested;
  - **Interested**;
  - **Wants an audit**;
  - **Do not contact**.

  An optional short note can be added. Like reach-out notes, it refuses phone numbers and emails.
- **"Not interested"** comes back after 6 months (changeable). **"Do not contact"** is permanent and the prospect never shows again, even in future scout runs.
- **Calls are dialed by hand** from the phone or Google Maps. Atlas never calls, texts or emails anyone.

## 4. Lining up audits
- **"Wants an audit"** (or the **"Line up an audit"** button) opens the audit builder, already filled in: name, website, town, kind of business, and the competitors Scout found.
- **The data Scout already paid for is reused**, so we don't pay twice (same 30-day rule as the audit builder).
- It also creates a follow-up for the rep: **"Deliver audit to [business]"**, due in 3 working days (changeable).

## 5. Into GoHighLevel, and results
- **GoHighLevel stays read-only.** When a prospect is interested, the rep adds them to GoHighLevel as usual. Atlas gives a **"Copy for GoHighLevel"** button (name, website, town, the Scout reasons) to paste. It's copy-only.
- On the next lead refresh, Atlas **matches the new GoHighLevel lead to the prospect** (by website, then name + town). The rep can also pick the lead by hand.
- From then on, the existing sales tracking does the rest: follow-ups, reach-outs, stage, won/lost, value.
- **Results card** (owner and managers; each salesperson sees their own numbers):
  - **The funnel:** scouted → assigned → visited/called → talked to the owner → interested → audit delivered → in GoHighLevel → **won**;
  - **broken down by:** salesperson · town · kind of business · main signal (Ads vs SEO vs No website);
  - **money:** scout + audit spend, deals won and their monthly value (from GoHighLevel), **cost per won client**.

  Numbers show their source; deal values are labeled "from GoHighLevel, not revenue".

## 6. Optional AI help (later, copy-only)
- **"Talking points"** on a prospect: 3–4 short lines for the walk-in, from the Scout reasons.
- The business name is swapped for a code, and nothing is sent or saved without a tap.
- About 1–3 cents each, from the existing AI budget.

## How the data gets in (phases)
Same pattern as the audit builder, so we stay inside today's approved rules.

### Phase S1: Scout list, assignment, walk-ins, outcomes, routes
- The scout **run itself happens in Claude Code**, where DataForSEO is already connected, like audit data today:
  1. **Sales → Scout → New run** builds the run settings and a **Scout prompt** (copy-only).
  2. The run produces a results file.
  3. **Attach results** in Atlas: it checks every row strictly (source + date on every figure, no personal contact details, size limits), scores them, removes our clients and existing leads, and saves the list.
- The app itself **fetches nothing and has no new network code.**
- Migration **`0024`** (see below).

### Phase S2: audits from prospects, GoHighLevel matching, results card
- No new database tables if S1 is built with these columns.

### Phase S3: in-app runs
- The app runs Scout itself, with a "Run" button and an optional weekly refresh of the same area.
- **Needs the same approval as audit Phase E:** one network module that sends POST requests only to allowlisted DataForSEO read endpoints (their reads use POST). GoHighLevel stays GET-only.
- The caps below start to matter here.

### Phase S4: AI talking points (copy-only)

## Database change: `0024_scout.sql` (you review it and run it in Supabase)
`0023` (saved audits) is written but not run yet; run that first.
- **`scout_runs`:** who started it, area, kinds of business, size, estimated and actual cost, when, source.
- **`scout_prospects`:**
  - **Business facts:** name, website, category, **business address**, map position, Google Maps place link, rating, review count.
  - **What Scout found:** signals (each with source + date), score + reasons.
  - **Where it stands:** status (new / assigned / visited / interested / audit / in GoHighLevel / won / lost / skipped / do-not-contact), assigned salesperson, matched GoHighLevel lead, matched audit, archived.
  - **Never stored:** owner names, phone numbers or emails (database check, like reach-out notes).
- **`scout_visits`:** add-only log (prospect, walk-in or call, outcome, note, who, when). The database stamps who and when.
- **`scout_do_not_contact`:** website/name keys that future runs skip forever. Owner and managers can add; nobody can delete.
- **Spending:** a `scout` line under the same capped-ledger design as `audit_spend` (an add-only ledger with a database-enforced monthly cap). The cost is written down *before* any paid call; if it's over the cap, the call never happens.
- **Who can see and do what:**

  | | Owner | Managers | Salespeople | Developers |
  |---|---|---|---|---|
  | Start a run, attach results | yes | yes | yes (own cap; results go to their own list) | no |
  | See prospects | all | all | **their own + the unclaimed shared pool** | none |
  | Claim from the pool | yes | yes | yes (only unclaimed ones, only to themselves) | no |
  | Assign to someone else / return to pool / skip / archive | yes | yes | no | no |
  | Log a visit or call | yes | yes | on their prospects | no |
  | Mark do-not-contact | yes | yes | yes (on their prospects) | no |
  | See spend and results | all | all | their own numbers | none |

- **Every new table:** security rules (RLS), the two-factor rule (restrictive `aal2`), minimum grants, and **break-in tests**:
  - a salesperson can't see another salesperson's prospects, or reassign one;
  - a salesperson can claim only an unclaimed prospect, and only for themselves (two reps claiming at once: the first wins);
  - nobody can edit or delete visit logs;
  - developers see nothing;
  - phone numbers and emails are refused;
  - the whole-database "salesperson sees nothing else" test is extended, not weakened.

## Files (S1)
- **New:**
  - `src/lib/scout.ts` (pure: `scoreProspect`, `SCOUT_RULES`, `routeOrder`, `mapsRouteUrl`, `scoutFunnel`, `matchLead`);
  - `src/lib/scout-intake.ts` (strict results checker);
  - `docs/SCOUT_PROMPT.md`;
  - `supabase/migrations/0024_scout.sql`.
- **New screens:**
  - `src/app/(app)/sales/scout/` (list, `new`, `[id]`, results);
  - components in `src/components/scout/`.
- **Changed:**
  - `src/app/actions.ts` (`saveScoutRun`, `attachScoutResults`, `assignProspects`, `claimProspect`, `logScoutVisit`, `skipProspect`, `markDoNotContact`; each validated, as the signed-in user, `notWhilePreviewing()`);
  - `src/lib/data-source.ts` (reads);
  - `src/lib/sales.ts` + `TodayPlan` ("Walk-ins today");
  - the Sales tab (a Scout card);
  - `supabase/tests/10_rls_break_in.sql`;
  - `tests/scout.test.ts`, `tests/guardrails.test.ts`;
  - `CLAUDE.md` (next migration 0025).
- **Not touched:** `src/lib/ghl/` (still GET-only), `src/lib/ai/` (until S4).

## Cost (estimates, confirmed by the first test run)
- **Building it:** $0 in services.
- **A scout run** (DataForSEO, pay-as-you-go; prices are per search/listing and change, so the run shows its own estimate first):
  - **first test: ~100 businesses in one town and 2–3 kinds of business, likely about $1–5;**
  - a monthly area sweep, likely ~$5–20.
- **Cap (owner's choice):** **$25 a month for Scout**, everyone together, separate from the $50/month audit cap and the $10/month AI budget.
- **Per salesperson (proposed): $10 a month** inside that $25, so one rep can't use it all. You can change both, per person too.
- **Routes:** Google Maps links are free.
- **AI talking points (S4):** about 1–3 cents each, from the AI budget.

## Risks and things to review (not legal advice)
- **Calls:** cold-calling businesses is generally treated differently from calling consumers, but rules vary by state, and **mobile numbers** have stricter rules. Some numbers on Google listings are owners' cell phones.
  - Our safeguards: hand-dial only, never auto-dial, never text first, honor "do not contact" forever, and keep call hours sensible.
  - **Worth a quick check with someone who knows telemarketing rules in your state before calling at scale.**
- **Walk-ins:** respect "No soliciting" signs (there's an outcome button for it, which counts as do-not-contact).
- **Data:** business listings are public business facts, but they're still data about real businesses.
  - We keep the minimum (no people's names, no phones or emails) and keep a source and date on everything.
  - Prospects not worked in 12 months are archived.
  - **Flagged for your privacy review**, per the project rules.
- **"Not optimized" is a guess.** The screen says "signs" and shows the evidence, so reps don't overclaim to a business owner.
- **Scores can be wrong.** Every reason is visible, the weights are tunable, and the results card shows which signals actually lead to wins.
- **Pasted results are untrusted:** checked field by field, shown as plain text, never treated as instructions.
- **A new table salespeople can read:** covered by own-rows-only rules and break-in tests.

## Done means (S1)
- The owner starts a run, copies the Scout prompt, attaches the results, and sees a scored list with reasons and sources, with existing clients and leads left out.
- The owner assigns prospects to a salesperson. The salesperson sees only theirs (break-in tests), gets "Walk-ins today", opens a route in Google Maps, and logs outcomes.
- "Do not contact" is never shown again, even after a new run.
- Before `0024` is run, Scout screens say "needs 0024" and nothing else breaks.
- `npm run check` and `npm run test:rls` pass; checked on phone and desktop width.

## Questions for the owner
Answered: 2 (salespeople too), 3 (no phones, Maps link), 4 (own + shared pool to claim), 5 ($25/month).

All answered on 2026-11-24 (see Status).
