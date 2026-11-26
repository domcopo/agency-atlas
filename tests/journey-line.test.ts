// Clients page Journey Line, action cards, placement by start date, and editable steps
// (docs/CLIENTS_JOURNEY_LINE_PLAN.md, 0038). All names here are fictional.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_STEPS,
  JOURNEY_DELIVERABLES,
  journeyState,
  parseJourneyStep,
  placementFor,
  stepsFromConfig,
  touchByStep,
  type JourneyState,
  type JourneyStepRow,
} from "@/lib/journey";
import { actionCards, auditForClient, CARDS_SHOWN, clusterTiming, dotInitials, lineLayout, parsePipelineFilters, pipelineGroups, placeDots, reachedOut, stageCounts, type LineClient } from "@/lib/journey-line";
import type { GhlContactTimes } from "@/lib/types";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const today = "2026-11-25";
const fmt = (d: string) => d;

const ghl = (over: Partial<GhlContactTimes>): GhlContactTimes => ({
  lastInboundAt: null,
  lastOutboundAt: null,
  lastCallAt: null,
  lastCallSeconds: null,
  lastChannel: null,
  lastDirection: null,
  unansweredOutbound: 0,
  syncedAt: "2026-11-25T06:00:00Z",
  ...over,
});

describe("deliverables and editable steps (0038)", () => {
  it("the deliverable list matches the database check", () => {
    const sql = read("supabase/migrations/0038_journey_steps.sql");
    const m = sql.match(/deliverable in \(([^)]*)\)/);
    expect(m).not.toBeNull();
    const inDb = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(inDb).toEqual(JOURNEY_DELIVERABLES.map(([k]) => k).sort());
  });

  it("seeds exactly today's 27 touches and 3 Grow steps, with the approved deliverables", () => {
    const sql = read("supabase/migrations/0038_journey_steps.sql");
    const rows = [...sql.matchAll(/^ {2}\((\d+), (\d), (\d+), '((?:[^']|'')*)'.*'([a-z_]+)'\)[,;]$/gm)];
    expect(rows).toHaveLength(30);
    for (const r of rows) {
      const t = touchByStep(Number(r[1]))!;
      expect(Number(r[2])).toBe(t.stage);
      expect(Number(r[3])).toBe(t.day);
      expect(r[4]!.replaceAll("''", "'")).toBe(t.title);
      expect(r[5]).toBe(t.deliverable);
    }
    expect(touchByStep(26)!.deliverable).toBe("survey");
    expect(touchByStep(25)!.deliverable).toBe("none");
    expect(touchByStep(27)!.deliverable).toBe("referral_ask");
    expect(touchByStep(1)!.deliverable).toBe("baseline_audit");
  });

  it("merges edits over the defaults, keeping step numbers, stages and day order", () => {
    const rows: JourneyStepRow[] = [
      { step: 12, day: 44, title: "Six-week call", how: "Call", channel: "call", with_seo: false, say: "How it's going.", ask: null, template: "Hi [First name]", deliverable: "progress_update" },
      { step: 13, day: 10, title: "Bad day", how: "Text", channel: "fax", with_seo: false, say: "x", ask: null, template: null, deliverable: "nope" },
    ];
    const s = stepsFromConfig(rows);
    const t12 = touchByStep(12, s)!;
    expect(t12).toMatchObject({ step: 12, stage: 2, day: 44, title: "Six-week call", deliverable: "progress_update", ask: undefined, template: "Hi [First name]" });
    const t13 = touchByStep(13, s)!;
    expect(t13.channel).toBe("text"); // bad channel → default
    expect(t13.deliverable).toBe("none"); // bad deliverable → default
    expect(t13.day).toBeGreaterThanOrEqual(44); // never before the touch ahead of it
    expect(s.touches.map((t) => t.step)).toEqual(DEFAULT_STEPS.touches.map((t) => t.step));
    expect(stepsFromConfig([])).toBe(DEFAULT_STEPS);
    expect(stepsFromConfig(null)).toBe(DEFAULT_STEPS);
  });

  it("checks the edit form in plain English", () => {
    const raw = { step: "3", day: "2", title: "First pages", how: "Text", channel: "text", withSeo: true, say: "What we started.", ask: "", template: "Hi [First name]", deliverable: "pages_update" };
    expect(parseJourneyStep(raw)).toMatchObject({ ok: true, row: { step: 3, day: 2, ask: null } });
    expect(parseJourneyStep({ ...raw, day: "30" })).toMatchObject({ ok: false, error: expect.stringMatching(/between day 0 and day 7/) });
    expect(parseJourneyStep({ ...raw, template: "Email owner@example.com" })).toMatchObject({ ok: false });
    expect(parseJourneyStep({ ...raw, template: "Call 330-555-0123" })).toMatchObject({ ok: false });
    expect(parseJourneyStep({ ...raw, deliverable: "gift" })).toMatchObject({ ok: false });
    expect(parseJourneyStep({ ...raw, channel: "fax" })).toMatchObject({ ok: false });
    expect(parseJourneyStep({ ...raw, title: " " })).toMatchObject({ ok: false });
    expect(parseJourneyStep({ ...raw, step: "28" })).toMatchObject({ ok: false, error: "Unknown step." });
    // Grow steps have no day.
    expect(parseJourneyStep({ ...raw, step: "101", day: "" })).toMatchObject({ ok: true, row: { day: 0 } });
  });
});

describe("placing existing clients by start date", () => {
  it("day 0 is an ordinary start at touch 1", () => {
    expect(placementFor(today, today)).toEqual({ kind: "place", startedOn: today, placedStep: null, step: 1, daysIn: 0 });
  });
  it("day 40 lands on touch 12 (the 45-day call), not overdue", () => {
    const p = placementFor("2026-10-16", today);
    expect(p).toMatchObject({ kind: "place", step: 12, placedStep: 12, daysIn: 40 });
    const j = journeyState({ startedOn: "2026-10-16", placedStep: 12, touches: [], today });
    expect(j.next).toMatchObject({ step: 12, due: "2026-11-30", overdue: false });
    expect(j.ticks.slice(0, 11).every((t) => t === "placed")).toBe(true);
    expect(j.ticks[11]).toBe("next");
    expect(j.handled).toBe(0);
    expect(j.stage).toBe(2);
  });
  it("day 90 still finishes onboarding; day 91 goes to Grow", () => {
    expect(placementFor("2026-08-27", today)).toMatchObject({ kind: "place", daysIn: 90, step: 26 });
    expect(placementFor("2026-08-26", today)).toEqual({ kind: "grow", daysIn: 91 });
  });
  it("no start date or a future one is left alone", () => {
    expect(placementFor(null, today)).toEqual({ kind: "no_start" });
    expect(placementFor("not a date", today)).toEqual({ kind: "no_start" });
    expect(placementFor("2026-12-01", today)).toEqual({ kind: "future", startDate: "2026-12-01" });
  });
  it("a placement is ignored without a journey start, and logged touches still count", () => {
    expect(journeyState({ placedStep: 12, touches: [], today }).mode).toBe("grow");
    const j = journeyState({ startedOn: "2026-10-16", placedStep: 12, touches: [{ step: 12, status: "done", happenedOn: "2026-11-20" }], today });
    expect(j.next!.step).toBe(13);
    expect(j.handled).toBe(1);
  });
});

describe("the Journey Line layout", () => {
  const { segments, ticks, growX } = lineLayout(DEFAULT_STEPS);
  it("has 6 segments in order, filling the line, and 27 ticks", () => {
    expect(segments.map((s) => s.label)).toEqual(["Kickoff", "First results", "Month 2", "Month 3", "90-day wrap", "Grow"]);
    expect(ticks).toHaveLength(27);
    for (let i = 1; i < segments.length; i++) expect(segments[i]!.from).toBeCloseTo(segments[i - 1]!.from + segments[i - 1]!.width, 2);
    expect(segments[5]!.from + segments[5]!.width).toBeCloseTo(100, 1);
    expect(segments[2]!.width).toBeGreaterThan(segments[0]!.width); // Month 2 has 9 touches, Kickoff 4
  });
  it("each tick sits inside its stage's segment; Grow sits in Grow", () => {
    for (const t of ticks) {
      const s = segments[t.stage]!;
      expect(t.x).toBeGreaterThan(s.from);
      expect(t.x).toBeLessThan(s.from + s.width);
    }
    expect(growX).toBeGreaterThan(segments[5]!.from);
  });
  it("makes short initials without the (fictional) label", () => {
    expect(dotInitials("Sample Plumbing (fictional)")).toBe("SP");
    expect(dotInitials("acme")).toBe("A");
    expect(dotInitials("(sample)")).toBe("?");
  });
});

const clients: LineClient[] = [
  { slug: "a", name: "Alpha Roofing (fictional)", services: ["SEO"], ownerId: "s1", ownerName: "Rep (sample)", vip: true, health: "healthy" },
  { slug: "b", name: "Bravo Plumbing (fictional)", services: ["SEO", "Ads"], ownerId: "s2", health: "at_risk" },
  { slug: "c", name: "Charlie HVAC (fictional)", services: ["Website"], health: "watch" },
  { slug: "d", name: "Delta Electric (fictional)", services: ["SEO"], ownerId: "s1", ghl: ghl({ lastInboundAt: "2026-11-24T15:00:00Z", lastOutboundAt: "2026-11-20T15:00:00Z", lastChannel: "call" }), lastLogged: "2026-11-20" },
];
const journeys = new Map<string, JourneyState>([
  ["a", journeyState({ startedOn: "2026-11-25", touches: [], today })], // touch 1 due today
  ["b", journeyState({ startedOn: "2026-11-10", touches: [], today })], // touch 1 overdue
  ["c", journeyState({ startedOn: "2026-10-16", placedStep: 12, touches: [], today })], // touch 12, later
  ["d", journeyState({ touches: [], lastContact: "2026-11-20", today })], // Grow
]);

describe("dots", () => {
  it("knows when a client reached out and nobody has been in touch since", () => {
    expect(reachedOut(clients[3]!.ghl, clients[3]!.lastLogged, today)).toEqual({ at: "2026-11-24" });
    expect(reachedOut(ghl({ lastInboundAt: "2026-11-24T15:00:00Z", lastOutboundAt: "2026-11-24T16:00:00Z" }), undefined, today)).toBeNull(); // we replied
    expect(reachedOut(ghl({ lastInboundAt: "2026-11-24T15:00:00Z" }), "2026-11-24", today)).toBeNull(); // logged in Atlas that day
    expect(reachedOut(ghl({ lastInboundAt: "2026-10-01T15:00:00Z" }), undefined, today)).toBeNull(); // too old
    expect(reachedOut(undefined, undefined, today)).toBeNull();
  });

  it("groups clients on the same touch and orders the worst first", () => {
    const cl = placeDots(clients, journeys, DEFAULT_STEPS, today);
    expect(cl.map((c) => c.key)).toEqual(["1", "12", "grow"]);
    expect(cl[0]!.dots.map((d) => [d.slug, d.timing])).toEqual([
      ["b", "overdue"],
      ["a", "today"],
    ]);
    expect(clusterTiming(cl[0]!)).toBe("overdue");
    expect(cl[1]!.dots[0]).toMatchObject({ slug: "c", timing: "later", step: 12 });
    expect(cl[2]!.dots[0]).toMatchObject({ slug: "d", reachedOut: true, stage: 5 });
    expect(stageCounts(cl).map((s) => s.total)).toEqual([2, 0, 1, 0, 0, 1]);
    expect(stageCounts(cl)[0]).toEqual({ total: 2, overdue: 1, today: 1 });
  });
});

describe("action cards", () => {
  const cards = actionCards({
    clients,
    journeys,
    steps: DEFAULT_STEPS,
    risks: [
      { slug: "b", problem: "Health dropped to At risk", severity: "high" },
      { slug: "c", problem: "No contact in 40 days", severity: "medium" },
    ],
    requests: [{ id: "r1", slug: "c", to: "paused", reasonLabel: "Price or budget" }],
    today,
    formatDay: fmt,
  });

  it("one card per client, most urgent first, other reasons as tags", () => {
    expect(cards.map((c) => [c.slug, c.kind])).toEqual([
      ["b", "overdue"],
      ["d", "reached_out"],
      ["a", "today"],
      ["c", "risk"],
    ]);
    expect(cards[0]!.also).toEqual(["risk"]);
    expect(cards[3]!.also).toEqual(["request"]);
  });

  it("shows the touch and picks one main button", () => {
    expect(cards[0]).toMatchObject({ step: 1, touchTitle: "Kickoff call", button: "log_call", context: expect.stringMatching(/^Overdue since 2026-11-10 · Call/) });
    expect(cards[1]).toMatchObject({ step: null, button: "open", context: expect.stringMatching(/called on 2026-11-24 \(GoHighLevel time\)/) });
    expect(cards[3]!.button).toBe("open");
  });

  it("text and email touches get Mark sent; a request alone gets Review", () => {
    const j = new Map([["a", journeyState({ startedOn: "2026-11-25", touches: [{ step: 1, status: "done", happenedOn: today }], today })]]);
    const c2 = actionCards({ clients: [clients[0]!], journeys: j, steps: DEFAULT_STEPS, risks: [], requests: [], today, formatDay: fmt });
    expect(c2[0]).toMatchObject({ step: 2, button: "mark_sent", channel: "text" });
    const c3 = actionCards({ clients: [clients[2]!], journeys: new Map(), steps: DEFAULT_STEPS, risks: [], requests: [{ id: "r1", slug: "c", to: "canceled", reasonLabel: "Other" }], today, formatDay: fmt });
    expect(c3[0]).toMatchObject({ kind: "request", button: "review", context: "VA asked to mark lost: Other" });
  });

  it("nothing due, no card; risks for clients you can't see are dropped", () => {
    const quiet = actionCards({ clients: [clients[2]!], journeys, steps: DEFAULT_STEPS, risks: [{ slug: "zz", problem: "x", severity: "high" }], requests: [], today, formatDay: fmt });
    expect(quiet).toEqual([]);
    expect(CARDS_SHOWN).toBe(5);
  });
});

describe("full pipeline", () => {
  it("groups by stage then touch, with filters", () => {
    const all = pipelineGroups(clients, journeys, DEFAULT_STEPS, today, parsePipelineFilters({}));
    expect(all.map((s) => s.count)).toEqual([2, 0, 1, 0, 0, 1]);
    expect(all[0]!.touches[0]).toMatchObject({ step: 1, title: "Kickoff call" });
    const seo = pipelineGroups(clients, journeys, DEFAULT_STEPS, today, parsePipelineFilters({ service: "SEO" }));
    expect(seo.reduce((n, s) => n + s.count, 0)).toBe(3);
    const overdue = pipelineGroups(clients, journeys, DEFAULT_STEPS, today, parsePipelineFilters({ overdue: "1" }));
    expect(overdue.reduce((n, s) => n + s.count, 0)).toBe(1);
    const mine = pipelineGroups(clients, journeys, DEFAULT_STEPS, today, parsePipelineFilters({ owner: "s1" }));
    expect(mine.reduce((n, s) => n + s.count, 0)).toBe(2);
    const risky = pipelineGroups(clients, journeys, DEFAULT_STEPS, today, parsePipelineFilters({ health: "at_risk" }));
    expect(risky[0]!.touches[0]!.clients.map((c) => c.slug)).toEqual(["b"]);
  });
  it("ignores bad filter values", () => {
    expect(parsePipelineFilters({ service: "Fax", health: "great", owner: "x'; drop", overdue: "yes" })).toEqual({ service: null, owner: null, health: null, overdueOnly: false });
  });
});

describe("latest audit for a client", () => {
  const audits = [
    { id: "1", title: "Alpha Roofing audit", company: "Alpha Roofing LLC", createdAt: "2026-10-01T00:00:00Z", archived: false },
    { id: "2", title: "Alpha Roofing", company: null, createdAt: "2026-11-01T00:00:00Z", archived: false },
    { id: "3", title: "Alpha Roofing", company: "Alpha Roofing", createdAt: "2026-11-20T00:00:00Z", archived: true },
    { id: "4", title: "Bravo Plumbing", company: "Bravo Plumbing", createdAt: "2026-11-21T00:00:00Z", archived: false },
  ];
  it("matches by business name only, newest first, never archived", () => {
    expect(auditForClient("Alpha Roofing (fictional)", audits)?.id).toBe("2");
    expect(auditForClient("Charlie HVAC (fictional)", audits)).toBeNull();
    expect(auditForClient("(fictional)", audits)).toBeNull();
  });
});
