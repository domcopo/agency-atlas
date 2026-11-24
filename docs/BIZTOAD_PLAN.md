# BizToad plan: a friendly toad that is the face of the AI helper

**Status:** plan approved by the owner 2026-11-24 with all recommended answers (see "Decisions" below). No feature code, migration or new package yet; each phase still needs its own go-ahead.
**Written:** 2026-11-24.

**Approved 2026-11-24:**
1. Phones: a still 32 px toad face in the phone top bar (no animation).
2. Roles: owner + managers first (Phase 2); developers and sales in Phase 3 after their break-in tests pass.
3. Cap: $25/month total, $5 per person, inside the whole-app AI budget.
4. Voice: $0 for now (free push-to-talk only); revisit a paid call after a month of use.
5. Picture rights: **still open.** The owner must confirm the agency owns the rights to the "Biz Toad CEO" picture before the redraw copies its look.
Defaults kept: no billing in BizToad (even for the owner), conversations not saved, per-device hide plus an owner switch for everyone.

**Phase 1 built 2026-11-24** (no AI, no database change, no new package): `src/lib/toad.ts` (rules, tested in `tests/toad.test.ts`), `src/components/toad/` (`ToadSvg`, `BizToad`, `ToadModePicker`), styles in `globals.css`, placed in `src/app/(app)/layout.tsx`, switch on the Account page (cookie `toad`: on / calm / hidden). The drawing is a generic green toad with a black bow tie, not a copy of the "Biz Toad CEO" picture (rights still unconfirmed). Not in Phase 1: the owner's "off for everyone" switch, which needs the `toad_settings` table (Phase 2).

## In one paragraph

BizToad is a small, hand-drawn toad (green head, black bow tie) that sits in the bottom-right corner of the app on computers. Its eyes follow your mouse when the mouse comes close, and every minute or two it blinks or does a tiny hop. Tap it and a chat panel opens where you can ask a question ("Which of my work orders are overdue?", "Where do I log a check-in?", "What should I look at today?"). It answers using the same guarded AI path the app already uses for Smart add and the briefing, and it can only see what *your* login can already see. It suggests; it never saves, sends or changes anything by itself. Talking to it out loud comes later, in two steps: free push-to-talk first, a paid real-time "call" only if you want it.

## Decisions only the owner can make

| # | Question | Options | My recommendation |
|---|---|---|---|
| 1 | **Phones** | (a) Nothing on phones. (b) A small, still toad face in the phone's top bar that opens the chat full-screen. | **(b)**. Phones have no mouse for the eyes to follow, and the bottom-right corner is already used by the Work Orders button, so a still icon in the top bar is the only spot that covers nothing. |
| 2 | **Which roles** | All four (owner, managers, developers, sales), or start with owner + managers. | **Start with owner + managers** (Phase 2), then add developers and sales (Phase 3) once their "can't see other people's data" tests pass. You can switch roles on and off later from a setting, without new code. |
| 3 | **Monthly cap for BizToad questions** | Any amount; it's counted inside the existing AI budget too. | **$25/month in total, $5 per person** (about 100 questions each). Raise it later if people use it. |
| 4 | **Voice "call" budget (Phase 5)** | $0 (push-to-talk only), about $25–200/month for a "pieced together" call, or about $75–660/month for an all-in-one voice AI (depends on minutes talked). See "Voice" below. | **$0 for now.** Try free push-to-talk first and decide on a paid call after a month of real use. |
| 5 | **The "Biz Toad CEO" picture** | Please confirm the agency owns the rights to it (drew it, bought it, or made it with a tool whose terms let you use it commercially). | Needed before we copy its look. The picture itself is only a reference; the app ships a redrawn version. |

Smaller choices with sensible defaults (say if you want them different): BizToad never sees billing, not even for the owner (billing has its own screen); conversations are not saved; anyone can hide BizToad on their own computer, and the owner can switch it off for everyone.

---

## 1. Look

- **Redrawn as a hand-made SVG** (a drawing made of shapes in code, which stays sharp at any size). A flat picture (PNG/JPG) can't move its eyes, because the eyes are baked into the pixels. In the SVG, each part is its own layer:
  - body and head, cheeks, mouth (two shapes: closed and "talking"),
  - two eye whites, two **pupils** (these move), two **eyelids** (these close for a blink),
  - the black **bow tie** (it can wiggle).
- Size: 64 × 64 px on computers (about the size of a large app icon), 32 × 32 px if shown in the phone top bar.
- Colors use the app's existing color names so it looks right in the dark theme and in the light theme (computers only).
- **No animation packages.** Motion is plain CSS (short transitions and keyframes) plus a few lines of JavaScript for the eye-tracking math. This keeps the app small and adds nothing to install.
- Files (proposed): `src/components/toad/ToadSvg.tsx` (the drawing), `src/components/toad/BizToad.tsx` (behavior), `src/lib/toad.ts` (pure, tested math and rules, with a `TOAD_RULES` constant for every number below).

## 2. Motion rules

| Rule | How |
|---|---|
| Eyes follow the mouse **only within about 200 px** of the toad | The page reports mouse position; at most once per screen refresh we measure the distance to each eye. Inside 200 px the pupil slides up to ~4 px toward the mouse; outside it drifts back to the middle. |
| Only where there is a mouse | Turned on only for devices that report a fine pointer that can hover (`(hover: hover) and (pointer: fine)`), so touchscreens skip it. |
| **Idle animation at most every 1–2 minutes** | A random wait between 60 and 120 seconds, then one small move: blink (most often), a 6 px hop, a bow-tie wiggle, or a glance left/right. Each lasts under 1 second. |
| Not while you're busy | No idle move while you're typing in a box, while a dialog is open, or while the browser tab is in the background (also saves battery). |
| **Stays still with "reduce motion"** | If the computer's "reduce motion" setting is on (`prefers-reduced-motion`), there is no eye following, no blinking, no hopping. It's a still drawing. |
| **Never covers buttons** | (1) The page gets extra bottom space on computers so the last button can always scroll above the toad. (2) After each scroll or resize, a quick check looks at what's under the toad; if it's a button, link or form field, the toad tucks itself into a small tab at the edge until the space is clear. (3) It sits below dialogs and menus, never on top of them. |
| **A way to hide it** | Right-click (or long-press) the toad: "Hide BizToad", "Calm mode (no animation)". Also a switch on the Account page. Saved in a cookie on that device, the same way the light/dark theme is saved, so there's no flash on page load. The owner can turn BizToad off for everyone in one setting. |
| Accessible | It's a real button labeled "Ask BizToad", reachable with the keyboard (Tab, Enter), with a visible focus ring and a 44 px+ touch target. The drawing itself is decorative and hidden from screen readers. |

## 3. Where it shows

- **Computers (1024 px and wider):** fixed in the bottom-right corner, 24 px from the edges. This corner is empty today on computers (the Work Orders button is phone-only and the side menu is on the left).
- **Phones and tablets:** depends on decision 1. Recommended: a still 32 px toad face in the top bar next to the logo, which opens the chat as a full-screen sheet. No animation, no eye tracking.
- **Not shown:** on the sign-in and two-factor screens, on the printable audit pages, or when the owner switch is off. While the owner is previewing someone else's view, the toad shows but asking is blocked (like every other action during preview).

## 4. Who sees it, and what it can see

- **Everyone the owner picks (decision 2) sees the toad.** But the AI only gets the facts *that person's login can already read*. The data it is given is collected through `src/lib/data-source.ts` as the signed-in person, so the database's security rules (RLS) decide what's included. Hiding things on screen is never the lock; the database is.
  - **Owner / managers:** clients, health, check-ins, work orders, team load, sales pipeline, like the existing briefing. No client money for managers (the `0025` rules already block it).
  - **Developers:** only their own work orders and the clients those touch (`my_work`, `my_client_contacts`). No revenue.
  - **Sales:** their leads, Scout prospects they can see, their plan. No client revenue.
  - **Billing never reaches BizToad**, for anyone. The toad's data builder will not import any billing module, and a guardrail test will check that.
- **It can also help you find things:** it gets a list of the screens *your role* can open, so it can answer "where do I…?" with a link. Links are checked against that list before they show, so it can never show a link to an outside website.
- **Conversations are not saved.** They live in the open browser tab and disappear when you close the panel or the tab. The only thing saved is the cost row (who asked, when, how much it cost), exactly like the other AI features.

## 5. The AI part

- **Same guarded path:** every question goes through `askAi` in `src/lib/ai/client.ts`, which means:
  - **No tools** are sent, so the AI can only reply with text. It cannot click, save, send or delete anything.
  - **Budget check before sending:** the worst-case cost must fit in what's left, or the question is refused before anything is sent.
  - **Names swapped for codes:** clients become `C7`, team members `T2` (`src/lib/ai/snapshot.ts`) and are swapped back only on your screen. What you type is run through the same swap.
  - **Logged** to `ai_usage` with a new feature name `ask_toad`.
  - The answer must match a fixed format and is shown as plain text (never as HTML).
- **Answer format (proposed `TOAD_SCHEMA`):** a short answer; up to 5 points, each saying where it came from ("work order list", "check-in on 11/20"); things it doesn't know; up to 3 in-app links; and, optionally, one work order draft.
- **Suggestions only.** If you ask "make a work order for the homepage fix", it shows a draft card with an **"Review and add"** button that opens the existing Smart add confirm screen. Nothing is saved until a person taps Confirm, and only people whose role can already add work orders see that button (today: owner, managers, and sales for their own leads; the database enforces it).
- **Untrusted text stays data:** client messages, notes and anything you paste are wrapped as data the AI is told never to obey. Even if it were tricked, it has no tools and its links are checked.
- **Conversation length:** the panel keeps the last 6 back-and-forths so follow-up questions work; older ones are dropped to keep each question cheap.
- **Rate limit:** at most 1 question every 5 seconds and 30 per hour per person, enforced by the database (see below).

### Database change (proposed `0028_biztoad.sql`; next free number as of today, confirm before writing)

Today the database only lets the owner and managers use the AI (the `ai_usage` insert rule from `0005`). So BizToad needs one migration, which the owner runs in the SQL Editor:

- `ai_usage`: add `ask_toad` to the allowed features. Let each allowed role add **only** `ask_toad` rows, **only** for themselves. Reading the cost log stays owner/managers only.
- `toad_settings` (one row, owner edits): on/off for everyone, which roles may ask, the monthly total cap and the per-person cap.
- `toad_spend`: an add-only ledger, copied from the Scout pattern. Before each question, the app writes the worst-case cost; a database trigger refuses it if it would pass the person's cap, the BizToad total, or the whole AI budget, or if it breaks the rate limit. Each person reads only their own rows, so the panel can show "you've used $1.20 of $5 this month". (Counting worst-case amounts makes the cap a little stricter than real spending, which is the safe direction.)
- Every new table gets RLS, the two-factor (`aal2`) rule, no update/delete grants, and break-in tests in `supabase/tests/10_rls_break_in.sql`.
- App code keeps working before `0028` is run: the toad shows "Asking needs database update 0028".

## 6. Voice

**Phase 4: push-to-talk and read-aloud. Free.**
- A microphone button in the panel: hold it (or tap to start/stop), speak, and your words appear in the box *for you to check* before sending. This uses the browser's own speech-to-text, the same one Smart add already uses (`QuickAddWorkOrders.tsx`). It's hidden in browsers that don't have it (for example Firefox).
- **Privacy note:** the browser's speech-to-text is free, but Chrome sends the audio to Google, and Safari may send it to Apple, to turn it into text. That happens *before* the app can swap names for codes. This is already true for Smart add today. The panel will say so next to the mic.
- **Read-aloud:** a speaker button uses the browser's built-in voice (`speechSynthesis`), preferring voices that run on the computer itself. The toad's mouth moves while it talks (still in reduce-motion mode). Stop it any time.
- Nothing is recorded or saved.

**Phase 5 (optional, separate approval): a real-time voice "call".** This needs a paid voice service and at least one new package or outside connection, so it gets its own plan before any work. Rough numbers below are estimates from typical published rates; they must be re-checked on the vendors' price pages before you approve anything.

| Option | How it works | Rough cost per minute of talking | ~7 people × 5 min/day (≈735 min/mo) | ~7 people × 15 min/day (≈2,200 min/mo) |
|---|---|---|---|---|
| A. Free push-to-talk (Phase 4) | Browser speech-to-text → Claude → browser voice. Not live, but close. | $0 extra (Claude cost per question only) | $0 extra | $0 extra |
| B. "Pieced together" call (recommended if you want a call) | A speech-to-text service (e.g. Deepgram, AssemblyAI) → **Claude through `client.ts`** → a voice service (e.g. ElevenLabs, OpenAI or Google voices) | about $0.02–0.06 plus Claude | ~$15–45 + Claude (~$10–25) | ~$45–130 + Claude (~$30–75) |
| C. All-in-one real-time voice AI | A voice model from another company (e.g. OpenAI Realtime, ElevenLabs Agents) hears and answers directly | about $0.10–0.30 | ~$75–220 | ~$220–660 |

Why B over C: in option C a *different* company's AI would read your data and answer, which breaks the app rule that only `client.ts` talks to an AI and skips the name-swapping, budget and logging. Option B keeps Claude as the "brain" with all the existing guards, and only adds ears and a voice. Either way, a new company would hear your team's voices, so it needs a privacy review (their data terms, whether they keep audio) before you sign up.

## 7. Costs

Prices from `src/lib/ai/budget.ts` (Claude Opus 5.5: $4 per million input tokens, $20 per million output tokens; a token is a word-piece, about 3/4 of a word).

| | Input | Output | Cost |
|---|---|---|---|
| Typical question (your role's facts + rules + recent chat ≈ 6,000–9,000 tokens in; ≈ 400–600 out) | ~$0.02–0.04 | ~$0.01 | **about 3–5 cents** |
| Worst case allowed per question (input capped at ~15,000 tokens, answer at 1,000) | $0.06 | $0.02 | **about 8 cents** (the budget check uses this) |

- **Monthly estimate:** 7 people × 5 questions a workday × 21 days ≈ 735 questions ≈ **$25–35/month**. Light use (2 a day) ≈ $10–15.
- **Monthly cap:** decision 3 (recommended $25 total, $5 per person). When a person hits their cap, the toad says so politely and offers the regular screens; nothing breaks. The whole-app AI budget (currently set by the owner on the AI screen) still applies on top, so BizToad can never spend past it.
- Ways to cut cost later, if needed: use a cheaper Claude model for BizToad only (price to be checked and added to `budget.ts` first), or send a smaller set of facts for simple "where is…" questions.
- The toad drawing, motion, browser speech-to-text and read-aloud cost nothing.

## 8. Phases (each needs its own go-ahead)

| Phase | What | Cost | "Done" means |
|---|---|---|---|
| **0. This plan** | Decisions above. | $0 | Owner has answered decisions 1–5. |
| **1. The toad (no AI)** | SVG drawing, eye-follow, blink/idle, reduce motion, tuck-away, hide switch, desktop corner (+ phone icon if chosen). Tapping it opens a panel that says "Ask BizToad is coming soon" with links to Smart add and the briefing. No database change. | $0 | Unit tests for the pure math in `src/lib/toad.ts` (eye offset stays within 4 px; no follow past 200 px; idle wait always 60–120 s; nothing moves when reduce motion is on). Checked by hand in Chrome and Safari: eyes follow, a blink happens, the toad tucks away over a button, hide sticks after reload. `npm run check` passes. No new package in `package.json`. |
| **2. Ask BizToad (text), owner + managers** | Migration `0028`; `askToad` server action in `src/app/actions.ts` (starts with `notWhilePreviewing()`); role-aware fact builder `src/lib/ai/toad-snapshot.ts`; `TOAD_SCHEMA`/`TOAD_TASK` in `client.ts`; usage meter in the panel. | ~$10–35/mo, inside the cap | Break-in tests: a developer/sales login can't add `ask_toad` rows yet (until Phase 3), can't read others' spend; caps and rate limit refuse over-limit inserts. Guardrail tests: the toad builder imports no billing code; no tools sent; every answer link is an allowed in-app path. A manager's question never includes client money. Every question adds one `ai_usage` row. Works with "needs 0028" before the migration. |
| **3. Developers and sales + work order drafts** | Turn on the roles the owner approved (setting, no new code path). Role-specific fact builders. "Review and add" hands a draft to the existing Smart add confirm screen. | inside the same cap | Break-in tests: a developer's question can't pull another developer's work or any revenue; a salesperson's can't pull client money. A draft is never saved without a Confirm tap. |
| **4. Push-to-talk + read-aloud** | Mic and speaker buttons; mouth animation. | $0 extra | Mic hidden where unsupported; text appears for review before sending; read-aloud stops on demand; privacy note shown next to the mic. |
| **5. Real-time voice call (optional)** | Separate plan: vendor choice, privacy review, package approval, cost cap. | per decision 4 | Its own plan doc and approval. |

## 9. Risks and what's not covered

- **It's an AI:** answers can be wrong. Every answer shows "Suggestion — check before acting" and where each point came from. It says "I don't know" when the facts aren't there, and is told never to invent revenue or dates.
- **Cost creep:** handled by per-person and total caps enforced in the database, plus the existing whole-app budget.
- **Data leaks between roles:** handled by building the AI's facts as the signed-in person (RLS), plus break-in tests. This is the most important thing to test before Phase 3.
- **Prompt injection** (a client message that says "ignore your rules"): no tools, data wrapped as untrusted, plain-text output, checked links.
- **Distraction:** idle moves are rare, small and can be switched off; reduce motion is respected.
- **Browser speech-to-text** sends audio to Google/Apple (see Voice).
- **Not covered by this plan:** saving conversations, the AI doing anything by itself, anything in GoHighLevel (still read-only forever), and the paid voice call (Phase 5 gets its own plan).
