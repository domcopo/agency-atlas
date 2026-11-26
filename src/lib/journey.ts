// The client journey (docs/CLIENT_CARE_PLAN.md, Step 1B): the owner's 27-touch plan for the
// first 90 days, grouped into 6 stages, then an ongoing "Grow" rhythm. Pure, tested in
// tests/journey.test.ts. The wording here is the starting copy: after 0038 the owner and
// managers edit it in Clients → Journey steps (journey_steps), and stepsFromConfig()
// merges their edits over these defaults. Step numbers and stages never change.
//
// Atlas never sends anything: the rep copies a message, sends it from GoHighLevel, and
// taps Done. Templates use [First name] / [Your name] placeholders; never real names.

export type TouchChannel = "call" | "text" | "email" | "video";

export interface JourneyTouch {
  step: number;
  /** 0 Kickoff · 1 First results · 2 Month 2 · 3 Month 3 · 4 90-day wrap (5 = Grow). */
  stage: number;
  /** Days after the journey starts. */
  day: number;
  /** How (shown on the card), and what Done picks by default. */
  how: string;
  channel: TouchChannel;
  /** Who does it: the client's main person, or with the SEO team's work in hand. */
  withSeo: boolean;
  title: string;
  say: string;
  ask?: string;
  /** Copy-only draft. [Business] is filled in; [First name] / [Your name] are for the rep. */
  template?: string;
  /** What this touch delivers (0038). "none" = a conversation only. */
  deliverable: Deliverable;
}

/**
 * Deliverable types (0038). Keep the keys in step with the journey_steps check in
 * 0038_journey_steps.sql (a test compares them).
 */
export const JOURNEY_DELIVERABLES = [
  ["none", "No deliverable"],
  ["baseline_audit", "Baseline audit (from the sale)"],
  ["progress_update", "Progress update / mini-audit"],
  ["heat_map", "Heat map snapshot"],
  ["monthly_report", "Monthly audit report"],
  ["gbp_recs", "Google Business Profile recommendations"],
  ["pages_update", "Pages completed update"],
  ["review_photo_ask", "Review / photo ask"],
  ["survey", "Survey"],
  ["referral_ask", "Referral ask"],
] as const;
export type Deliverable = (typeof JOURNEY_DELIVERABLES)[number][0];

export function asDeliverable(v: unknown): Deliverable | null {
  return JOURNEY_DELIVERABLES.some(([k]) => k === v) ? (v as Deliverable) : null;
}

export function deliverableLabel(d: Deliverable): string {
  return JOURNEY_DELIVERABLES.find(([k]) => k === d)?.[1] ?? "No deliverable";
}

/** The starting deliverables (owner-approved 2026-11-25); the same values seed 0038. */
const DEFAULT_DELIVERABLES: Partial<Record<number, Deliverable>> = {
  1: "baseline_audit",
  3: "pages_update",
  4: "pages_update",
  5: "heat_map",
  7: "review_photo_ask",
  8: "monthly_report",
  11: "gbp_recs",
  14: "progress_update",
  15: "review_photo_ask",
  16: "monthly_report",
  24: "monthly_report",
  26: "survey",
  27: "referral_ask",
  101: "monthly_report",
};

export const JOURNEY_STAGES = ["Kickoff", "First results", "Month 2", "Month 3", "90-day wrap", "Grow"] as const;
export const GROW_STAGE = 5;
export const JOURNEY_DAYS = 90;

const T = (
  step: number,
  stage: number,
  day: number,
  how: string,
  channel: TouchChannel,
  withSeo: boolean,
  title: string,
  say: string,
  ask?: string,
  template?: string,
): JourneyTouch => ({ step, stage, day, how, channel, withSeo, title, say, ask, template, deliverable: DEFAULT_DELIVERABLES[step] ?? "none" });

export const JOURNEY_TOUCHES: readonly JourneyTouch[] = [
  T(1, 0, 0, "Call", "call", false, "Kickoff call", "Welcome them, explain how we work and the first two weeks, and say a heat map is coming in week 2.", "Services, real service area, photos, Google and website access, who to contact, phrases to avoid."),
  T(2, 0, 0, "Text, after the call", "text", false, "Day-1 recap", "Thanks, a short recap, and a reminder of what to send.", "The items they promised on the call.",
    "Hey [First name], it's [Your name] with YO Marketing. Thanks for hopping on today, I enjoyed talking through [Business]. Quick recap: we're getting started on your local SEO. Could you send over [the items we asked for] when you have a minute? I'll text you in a couple of days with what we've started and the first pages."),
  T(3, 0, 2, "Text (email if they prefer)", "text", true, "First pages", "What we started (keywords, competitors), tips on reviews and photos, and the first two finished pages.", "A look at the two pages, Google reviews, recent photos, anything still missing.",
    "Hi [First name], quick update on [Business]: we've started your keyword and competitor research, and the first two pages are done: [links]. Could you take a look? Two things that help a lot right now: a few new Google reviews and some recent job photos."),
  T(4, 0, 7, "Text or email", "text", true, "Week-1 check-in", "Check in, share two more finished pages, and say the first heat map is next.", "Anything still outstanding, plus feedback on the pages so far.",
    "Hi [First name], two more pages are live for [Business]: [links]. Your first heat map comes next week. Is there anything you'd like changed on the pages so far? And if you can, send over [missing items]."),
  T(5, 1, 14, "Email + report, offer a call", "email", true, "First heat map", "Where they were at kickoff vs what changed. Be honest if movement is small: two weeks is a starting picture.", "Questions, and does the map match the area they really serve?"),
  T(6, 1, 14, "Text, same day", "text", false, "Heat map heads-up", "Let them know the heat map is in their inbox and offer to walk through it.", undefined,
    "Hi [First name], your first heat map for [Business] just landed in your email. Happy to hop on a quick call and walk you through it."),
  T(7, 1, 21, "Text or email", "text", false, "Week-3 nudge", "A light progress check, plus a review or photo nudge if still needed. Don't dump a new data pack.", "Anything blocking us, new photos, offers or service changes."),
  T(8, 1, 29, "Email + monthly report", "email", true, "Month-1 report", "The month-1 SEO report with the updated heat map: where they were, what changed, what we did, what's next.", "Feedback, and what to prioritise next month."),
  T(9, 1, 29, "Text, same day", "text", false, "Report headline", "One headline from the report and an offer to walk through it.", undefined,
    "Hi [First name], your month-1 report for [Business] is in your inbox. Headline: [one line]. Want me to walk you through it?"),
  T(10, 2, 32, "Text", "text", false, "Month-2 check-in", "Friendly check-in: anything they need from us, anything new on their side?"),
  T(11, 2, 33, "Email", "email", true, "Month-2 work plan", "This month's plan: pages, Google Business Profile and other agreed work."),
  T(12, 2, 45, "Call", "call", false, "45-day check-in call", "Results so far, what's next, any blockers.", "Reviews and new job photos."),
  T(13, 2, 45, "Text, after the call", "text", false, "Call recap", "A short recap of the call and the next steps you agreed."),
  T(14, 2, 51, "Email", "email", true, "Mid-month snapshot", "Work finished so far. Only mention ranking or review changes that are real."),
  T(15, 2, 52, "Text", "text", false, "Reviews and photos nudge", "A light nudge if reviews or photos are lagging; otherwise a short \"we're on track\" note."),
  T(16, 2, 59, "Email + monthly report", "email", true, "Month-2 report", "The monthly SEO report and updated heat map."),
  T(17, 2, 59, "Text, same day", "text", false, "Report headline", "Report headline and an offer to walk through it."),
  T(18, 2, 61, "Email", "email", false, "Anything you need?", "A short \"anything you need\" note, or a deeper update if a page went live or a competitor moved."),
  T(19, 3, 63, "Text", "text", false, "Month-3 check-in", "Friendly check-in heading into the last stretch of the first 90 days."),
  T(20, 3, 64, "Email", "email", true, "Month-3 plan", "The month-3 plan, tied back to the heat map and report."),
  T(21, 3, 67, "Call", "call", false, "60-day check-in call", "Progress, priorities, and anything they want changed."),
  T(22, 3, 67, "Text, after the call", "text", false, "Call recap", "A short recap of the call and next steps."),
  T(23, 3, 80, "Email", "email", false, "90-day heads-up", "A progress update, and a heads-up that the 90-day report and a short survey are coming."),
  T(24, 4, 89, "Email + report", "email", true, "90-day report", "The 90-day SEO report and heat map: where they started vs where they are now."),
  T(25, 4, 89, "Text, same day", "text", false, "90-day headline", "Report headline, plus a heads-up that a short survey follows."),
  T(26, 4, 92, "Email", "email", false, "Survey", "Ask for the short survey (Growth → Surveys).", undefined,
    "Hi [First name], it's been 90 days working on [Business]'s SEO. Would you take two minutes to tell us how it's going? [survey link] Your answers shape what we do next."),
  T(27, 4, 97, "Email or call", "email", false, "Referral ask", "Ask for referrals, after the survey (or a few days later if they haven't replied).", undefined,
    "Hi [First name], thanks again for trusting us with [Business]. If you know another business owner who'd like more calls from Google, we'd love an introduction. We'll take great care of them."),
];

/** The ongoing rhythm after day 90 (stage "Grow"). */
export const GROW_TOUCHES: readonly JourneyTouch[] = [
  T(101, 5, 0, "Email + monthly report", "email", true, "Monthly report", "The monthly SEO report and heat map, then a one-line text headline."),
  T(102, 5, 0, "Text or call", "text", false, "Mid-month check-in", "A light check-in: anything new, anything they need, a review or photo nudge if useful."),
  T(103, 5, 0, "Call", "call", true, "Quarterly review", "Competitor review (if their tier has one) and upsell ideas: what would grow them next?"),
];

/** The whole plan: the 27 onboarding touches and the Grow rhythm. */
export interface JourneySteps {
  touches: readonly JourneyTouch[];
  grow: readonly JourneyTouch[];
}
export const DEFAULT_STEPS: JourneySteps = { touches: JOURNEY_TOUCHES, grow: GROW_TOUCHES };

export function touchByStep(step: number, steps: JourneySteps = DEFAULT_STEPS): JourneyTouch | undefined {
  return steps.touches.find((t) => t.step === step) ?? steps.grow.find((t) => t.step === step);
}

/** A journey_steps row as read from the database (0038). */
export interface JourneyStepRow {
  step: number;
  day: number;
  title: string;
  how: string;
  channel: string;
  with_seo: boolean;
  say: string;
  ask: string | null;
  template: string | null;
  deliverable: string;
}

/**
 * The owner's edited steps over the defaults. Step numbers and stages always come from code;
 * a row with a bad value (or a missing row) keeps the default for that field, and days are
 * kept in order, so a broken row can never break the journey.
 */
export function stepsFromConfig(rows: JourneyStepRow[] | null | undefined): JourneySteps {
  if (!rows?.length) return DEFAULT_STEPS;
  const byStep = new Map(rows.map((r) => [Number(r.step), r]));
  const merge = (t: JourneyTouch, minDay: number): JourneyTouch => {
    const r = byStep.get(t.step);
    if (!r) return { ...t, day: Math.max(t.day, minDay) };
    const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
    const day = Number.isInteger(Number(r.day)) && Number(r.day) >= 0 && Number(r.day) <= 120 ? Number(r.day) : t.day;
    return {
      ...t,
      day: t.step > 100 ? 0 : Math.max(day, minDay),
      title: str(r.title, 60) ?? t.title,
      how: str(r.how, 60) ?? t.how,
      channel: asTouchChannel(r.channel) ?? t.channel,
      withSeo: typeof r.with_seo === "boolean" ? r.with_seo : t.withSeo,
      say: str(r.say, 400) ?? t.say,
      ask: r.ask === null ? undefined : (str(r.ask, 300) ?? t.ask),
      template: r.template === null ? undefined : (str(r.template, 1000) ?? t.template),
      deliverable: asDeliverable(r.deliverable) ?? t.deliverable,
    };
  };
  let minDay = 0;
  const touches = JOURNEY_TOUCHES.map((t) => {
    const m = merge(t, minDay);
    minDay = m.day;
    return m;
  });
  return { touches, grow: GROW_TOUCHES.map((t) => merge(t, 0)) };
}

/** Checks the edit form for one step (owner/managers). Returns the cleaned row or an error. */
export function parseJourneyStep(
  raw: { step: string; day: string; title: string; how: string; channel: string; withSeo: boolean; say: string; ask: string; template: string; deliverable: string },
  steps: JourneySteps = DEFAULT_STEPS,
): { ok: true; row: Omit<JourneyStepRow, "step"> & { step: number } } | { ok: false; error: string } {
  const step = Number(raw.step);
  const touch = touchByStep(step, steps);
  if (!touch) return { ok: false, error: "Unknown step." };
  const clean = (v: string) => v.replace(/[ \t]+/g, " ").trim();
  const title = clean(raw.title);
  if (!title || title.length > 60) return { ok: false, error: "Give the step a short name (up to 60 characters)." };
  const how = clean(raw.how);
  if (!how || how.length > 60) return { ok: false, error: "Say how it's done, e.g. \"Text\" or \"Email + report\" (up to 60 characters)." };
  const channel = asTouchChannel(raw.channel);
  if (!channel) return { ok: false, error: "Pick call, text, email or video." };
  const say = clean(raw.say);
  if (!say || say.length > 400) return { ok: false, error: "\"What to say\" is needed (up to 400 characters)." };
  const ask = clean(raw.ask);
  if (ask.length > 300) return { ok: false, error: "Keep \"What to ask for\" under 300 characters." };
  const template = raw.template.replace(/\r\n/g, "\n").trim();
  if (template.length > 1000) return { ok: false, error: "Keep the draft under 1,000 characters." };
  const deliverable = asDeliverable(raw.deliverable);
  if (!deliverable) return { ok: false, error: "Pick a deliverable (or \"No deliverable\")." };
  const all = `${say}\n${ask}\n${template}`;
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(all) || /\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/.test(all))
    return { ok: false, error: "Leave out emails and phone numbers. Use placeholders like [First name]." };
  let day = 0;
  if (step <= 27) {
    if (!/^\d{1,3}$/.test(raw.day.trim())) return { ok: false, error: "Day should be a whole number of days after kickoff (0 to 120)." };
    day = Number(raw.day.trim());
    const i = steps.touches.findIndex((t) => t.step === step);
    const before = i > 0 ? steps.touches[i - 1]!.day : 0;
    const after = i < steps.touches.length - 1 ? steps.touches[i + 1]!.day : 120;
    if (day < before || day > after) return { ok: false, error: `Touch ${step} has to stay between day ${before} and day ${after} so the touches stay in order.` };
  }
  return { ok: true, row: { step, day, title, how, channel, with_seo: raw.withSeo, say, ask: ask || null, template: template || null, deliverable } };
}

/** A ready-to-copy draft: the template, or a short one made from what to say. */
export function draftMessage(t: JourneyTouch, business: string): string {
  const base = t.template ?? `Hi [First name], ${t.say.charAt(0).toLowerCase()}${t.say.slice(1)}${t.ask ? ` Could you also send: ${t.ask.charAt(0).toLowerCase()}${t.ask.slice(1)}` : ""}`;
  return base.replaceAll("[Business]", business);
}

/** Done / Skip / unanswered call as saved (care_touches; "attempt" from 0031). */
export interface TouchLog {
  step: number;
  status: "done" | "skipped" | "attempt";
  happenedOn: string;
}

/** After this many unanswered calls, suggest finishing the touch by text or email. */
export const CALL_TRIES = 2;

/** The next weekday after a day (an unanswered call comes back then). */
export function nextWorkingDay(day: string): string {
  let d = addDays(day, 1);
  for (let i = 0; i < 3; i++) {
    const w = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (w !== 0 && w !== 6) break;
    d = addDays(d, 1);
  }
  return d;
}

export interface JourneyPlanRhythm {
  reportEveryDays: number;
  midMonthCheckIn: boolean;
  competitorReviewMonths: number;
}

/** "placed" = before the touch the owner placed this client on (0038): not done, never overdue. */
export type Tick = "done" | "skipped" | "placed" | "next" | "todo";

export interface JourneyState {
  /** "onboarding" = in the 27 touches; "grow" = after them (or started before the journey existed). */
  mode: "onboarding" | "grow";
  stage: number;
  /** The 27 touches, in order (all "todo" for a client who never started onboarding). */
  ticks: Tick[];
  handled: number;
  /** attempts = unanswered calls on this touch so far (0031). */
  next: { step: number; title: string; how: string; due: string; overdue: boolean; attempts: number } | null;
  startedOn: string | null;
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
const latest = (xs: string[]) => [...xs].sort().pop() ?? null;

/**
 * Where a client is on the journey, and the next touch.
 * - With a journey start date: touches logged on or after it count (a restart begins fresh).
 *   The next touch is the first one not done or skipped, due on start + its day.
 * - After all 27 (or with no start date: existing clients start in Grow): the next of
 *   monthly report, mid-month check-in (if the tier has one) and quarterly review.
 */
export function journeyState(input: {
  startedOn?: string | null;
  touches: TouchLog[];
  plan?: JourneyPlanRhythm | null;
  lastContact?: string | null;
  today: string;
  /** Owner's placement by start date (0038): touches before this step count as placed. */
  placedStep?: number | null;
  steps?: JourneySteps;
}): JourneyState {
  const { today } = input;
  const steps = input.steps ?? DEFAULT_STEPS;
  const placed = input.startedOn && input.placedStep && input.placedStep >= 2 && input.placedStep <= 27 ? input.placedStep : 1;
  const startedOn = input.startedOn ?? null;
  const all = startedOn ? input.touches.filter((t) => t.happenedOn >= startedOn) : [];
  // Unanswered calls keep a touch open; they only move its due date.
  const logs = all.filter((t) => t.status !== "attempt");
  const tries = all.filter((t) => t.status === "attempt");
  const byStep = new Map<number, TouchLog>();
  for (const t of logs) if (!byStep.has(t.step) || byStep.get(t.step)!.happenedOn < t.happenedOn) byStep.set(t.step, t);
  const firstOpen = startedOn ? steps.touches.find((t) => t.step >= placed && !byStep.has(t.step)) : undefined;
  const ticks: Tick[] = steps.touches.map((t) => {
    const l = byStep.get(t.step);
    if (l) return l.status === "skipped" ? "skipped" : "done";
    if (t.step < placed) return "placed";
    return firstOpen && t.step === firstOpen.step ? "next" : "todo";
  });
  const handled = steps.touches.filter((t) => byStep.has(t.step)).length;
  if (startedOn && firstOpen) {
    const mine = tries.filter((t) => t.step === firstOpen.step);
    const lastTry = latest(mine.map((t) => t.happenedOn));
    const planned = addDays(startedOn, firstOpen.day);
    const due = lastTry ? latest([planned, nextWorkingDay(lastTry)])! : planned;
    return { mode: "onboarding", stage: firstOpen.stage, ticks, handled, next: { step: firstOpen.step, title: firstOpen.title, how: firstOpen.how, due, overdue: due < today, attempts: mine.length }, startedOn };
  }

  // Grow: the ongoing rhythm.
  const plan = input.plan ?? { reportEveryDays: 30, midMonthCheckIn: true, competitorReviewMonths: 0 };
  const grow = input.touches.filter((t) => t.step > 100 && t.status !== "attempt" && (!startedOn || t.happenedOn >= startedOn));
  const lastOf = (step: number) => latest(grow.filter((t) => t.step === step).map((t) => t.happenedOn));
  const journeyEnd = startedOn ? (latest([addDays(startedOn, JOURNEY_DAYS), ...logs.filter((l) => l.step <= 27).map((l) => l.happenedOn)]) as string) : null;
  // Existing clients: count from the last contact, so nobody starts with a pile of overdue reports.
  const base = journeyEnd ?? input.lastContact ?? today;
  const lastReport = lastOf(101) ?? base;
  const options: { step: number; due: string }[] = [{ step: 101, due: addDays(lastReport, plan.reportEveryDays) }];
  const lastCheckIn = lastOf(102);
  if (plan.midMonthCheckIn && (!lastCheckIn || lastCheckIn < lastReport)) options.push({ step: 102, due: addDays(lastReport, Math.round(plan.reportEveryDays / 2)) });
  options.push({ step: 103, due: addDays(lastOf(103) ?? base, (plan.competitorReviewMonths || 3) * 30) });
  options.sort((a, b) => a.due.localeCompare(b.due) || a.step - b.step);
  const pick = options[0]!;
  const touch = touchByStep(pick.step, steps)!;
  return {
    mode: "grow",
    stage: GROW_STAGE,
    ticks: startedOn ? ticks : steps.touches.map(() => "todo"),
    handled,
    next: { step: pick.step, title: touch.title, how: touch.how, due: pick.due, overdue: pick.due < today, attempts: 0 },
    startedOn,
  };
}

/** Short label for the client list: "Month 2 · 45-day check-in call · due Nov 28". */
export function journeyLabel(j: JourneyState, formatDay: (d: string) => string): string {
  if (!j.next) return JOURNEY_STAGES[j.stage] ?? "";
  return `${JOURNEY_STAGES[j.stage]} · ${j.next.title} · ${j.next.overdue ? "overdue since" : "due"} ${formatDay(j.next.due)}`;
}

export interface TouchDue {
  slug: string;
  name: string;
  title: string;
  due: string;
  overdue: boolean;
  /** "main" = I'm the main person; "backup" = I'm the backup and it's overdue. */
  as: "main" | "backup" | "everyone";
}

/**
 * Home "Touches due": touches due today (or overdue) for clients where I'm the main person,
 * plus overdue ones where I'm the backup. Not linked to a team profile: everyone's.
 */
export function touchesDue(
  clients: { id: string; name: string; ownerId?: string; backupId?: string }[],
  journeys: Map<string, JourneyState>,
  staffId: string | null,
  today: string,
): TouchDue[] {
  const out: TouchDue[] = [];
  for (const c of clients) {
    const n = journeys.get(c.id)?.next;
    if (!n || n.due > today) continue;
    const as = !staffId ? "everyone" : c.ownerId === staffId ? "main" : c.backupId === staffId && n.overdue ? "backup" : null;
    if (!as) continue;
    out.push({ slug: c.id, name: c.name, title: n.title, due: n.due, overdue: n.overdue, as });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
}

/** Done in Atlas also logs a check-in, so health and "last contact" stay right. */
export const CHECK_IN_KIND: Record<TouchChannel, "call" | "message" | "email" | "meeting"> = {
  call: "call",
  text: "message",
  email: "email",
  video: "meeting",
};

export const STATUS_REASONS = [
  ["price", "Price or budget"],
  ["results", "Not happy with results"],
  ["in_house", "Doing it themselves"],
  ["closed", "Closed or sold the business"],
  ["no_reply", "Stopped replying"],
  ["other", "Other"],
] as const;
export type StatusReason = (typeof STATUS_REASONS)[number][0];

export function asStatusReason(v: unknown): StatusReason | null {
  return STATUS_REASONS.some(([k]) => k === v) ? (v as StatusReason) : null;
}

export function asTouchChannel(v: unknown): TouchChannel | null {
  return v === "call" || v === "text" || v === "email" || v === "video" ? v : null;
}

// ---------------------------------------------------------------------------
// Calls first: points toward the daily goal (0031)
// ---------------------------------------------------------------------------

/** A real conversation counts most; a voicemail + text or a text/email counts 1. Tune here. */
export const CARE_POINTS = { talked: 3, voicemail: 1, message: 1 } as const;
export const DEFAULT_DAILY_POINTS = 15;
/** The last touch of each onboarding stage: finishing it moves the client to the next stage. */
export const STAGE_LAST_STEP = [4, 9, 18, 23, 27] as const;

export type TouchOutcome = "talked" | "voicemail" | "text_instead";

export interface DayLog {
  step: number;
  status: "done" | "skipped" | "attempt";
  channel: TouchChannel | null;
  outcome: TouchOutcome | null;
}

export function touchPoints(l: DayLog): number {
  if (l.status === "skipped") return 0;
  if (l.status === "attempt") return CARE_POINTS.voicemail;
  const spoke = l.outcome === "talked" || (!l.outcome && (l.channel === "call" || l.channel === "video"));
  return spoke ? CARE_POINTS.talked : CARE_POINTS.message;
}

/** Today's progress for one person: points, real conversations, clients moved up a stage. */
export function dayProgress(logs: DayLog[], goal: number): { points: number; goal: number; calls: number; moved: number; pct: number } {
  const points = logs.reduce((n, l) => n + touchPoints(l), 0);
  const calls = logs.filter((l) => l.status === "done" && touchPoints(l) === CARE_POINTS.talked).length;
  const moved = logs.filter((l) => l.status !== "attempt" && (STAGE_LAST_STEP as readonly number[]).includes(l.step)).length;
  return { points, goal, calls, moved, pct: Math.min(100, Math.round((points / Math.max(1, goal)) * 100)) };
}

export function asOutcome(v: unknown): TouchOutcome | null {
  return v === "talked" || v === "voicemail" || v === "text_instead" ? v : null;
}

// ---------------------------------------------------------------------------
// Restart everyone (owner): a few new kickoffs per working day, most important first
// ---------------------------------------------------------------------------

export const RESTART_PER_DAY = 4;

/** Start days for each client, in the order given: perDay per weekday from `from` (weekends skipped). */
export function restartSchedule<T extends { id: string }>(clients: T[], from: string, perDay = RESTART_PER_DAY): { client: T; start: string }[] {
  let day = from;
  const weekday = (d: string) => {
    const w = new Date(`${d}T00:00:00Z`).getUTCDay();
    return w !== 0 && w !== 6;
  };
  while (!weekday(day)) day = addDays(day, 1);
  return clients.map((client, i) => {
    if (i > 0 && i % perDay === 0) day = nextWorkingDay(day);
    return { client, start: day };
  });
}

// ---------------------------------------------------------------------------
// Place by start date (0038, owner, one time): existing clients go to the touch that fits
// how long they've been with us, instead of everyone starting in Grow.
// ---------------------------------------------------------------------------

export type Placement =
  | { kind: "place"; startedOn: string; placedStep: number | null; step: number; daysIn: number }
  | { kind: "grow"; daysIn: number }
  | { kind: "no_start" }
  | { kind: "future"; startDate: string };

/**
 * Where a client with no journey yet should go, from their start date:
 * - day 0 to 90: journey start = their start date, on the first touch due today or later
 *   (earlier touches are "placed"; touch 1 = an ordinary start, placedStep null);
 * - past day 90: Grow (no change);
 * - no start date, or one in the future: left alone.
 */
export function placementFor(startDate: string | null | undefined, today: string, steps: JourneySteps = DEFAULT_STEPS): Placement {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { kind: "no_start" };
  if (startDate > today) return { kind: "future", startDate };
  const daysIn = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000);
  if (daysIn > JOURNEY_DAYS) return { kind: "grow", daysIn };
  const touch = steps.touches.find((t) => t.day >= daysIn) ?? steps.touches[steps.touches.length - 1]!;
  return { kind: "place", startedOn: startDate, placedStep: touch.step > 1 ? touch.step : null, step: touch.step, daysIn };
}

// ---------------------------------------------------------------------------
// Week-1 intake (0032): what to keep asking for until it's in. Only "received" is stored.
// Keys must match private.intake_keys_ok in 0032 (a test checks).
// ---------------------------------------------------------------------------

export const INTAKE_ITEMS = [
  ["services", "Final service list"],
  ["service_area", "Real service area"],
  ["brand", "Logo, colors, brand phrases"],
  ["photos", "Job and team photos (with permission)"],
  ["gbp_access", "Google Business Profile access"],
  ["site_access", "Website, domain, hosting access"],
  ["email_dns", "Email or DNS issues checked"],
  ["past_ads", "Past ads and keywords they care about"],
  ["contact_pref", "Preferred channel and best times"],
  ["contacts", "Others to keep in the loop"],
] as const;
export type IntakeKey = (typeof INTAKE_ITEMS)[number][0];

export function asIntakeKey(v: unknown): IntakeKey | null {
  return INTAKE_ITEMS.some(([k]) => k === v) ? (v as IntakeKey) : null;
}

/** Items still missing, as labels (shown on early touches: Kickoff and First results). */
export function missingIntake(received: Partial<Record<string, string>>): string[] {
  return INTAKE_ITEMS.filter(([k]) => !received[k]).map(([, label]) => label);
}
