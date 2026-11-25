// BizToad (docs/BIZTOAD_PLAN.md): motion rules (Phase 1), what the AI is given (Phase 2) and
// what developers and salespeople's BizToad is given (Phase 3).
import { describe, expect, it } from "vitest";
import { eyesMayFollow, mayMove, nextIdleDelay, pickVoice, speechText, parseToadMode, pickIdleMove, pupilOffset, TOAD_RULES } from "@/lib/toad";
import { buildCodebook, buildStaffBook, codebookFor } from "@/lib/ai/snapshot";
import { buildDeveloperToadFacts, buildNameBook, buildSalesToadFacts, mySalesLeads, redactNames, restoreNames, toadModeFor, type ToadSalesInput } from "@/lib/ai/toad-snapshot";
import type { ClientContactDates } from "@/lib/ops";
import type { SalesLead } from "@/lib/sales";
import type { Prospect } from "@/lib/scout";
import { buildToadFacts, pipelineCounts, cleanHistory, cleanQuestion, MONEY_KEY, restoreToadAnswer, safeToadLinks, scrubContacts, scrubMoney, stripMoney, TOAD_SCREENS, type ToadFactsInput } from "@/lib/ai/toad-snapshot";
import type { ClientAction, RosterClient } from "@/lib/types";

const eye = { x: 100, y: 100 };

describe("eyes follow the mouse only when it's close", () => {
  it("stays in the middle with no mouse", () => {
    expect(pupilOffset(eye, null)).toEqual({ dx: 0, dy: 0 });
  });

  it("does not follow past 200 px", () => {
    expect(pupilOffset(eye, { x: 100 + TOAD_RULES.followRadiusPx + 1, y: 100 })).toEqual({ dx: 0, dy: 0 });
    expect(pupilOffset(eye, { x: 400, y: 400 })).toEqual({ dx: 0, dy: 0 });
  });

  it("looks toward the mouse inside 200 px", () => {
    const right = pupilOffset(eye, { x: 250, y: 100 });
    expect(right.dx).toBeCloseTo(TOAD_RULES.maxPupilPx);
    expect(right.dy).toBeCloseTo(0);
    const up = pupilOffset(eye, { x: 100, y: 0 });
    expect(up.dy).toBeCloseTo(-TOAD_RULES.maxPupilPx);
  });

  it("never slides further than the limit (inside the eye), wherever the mouse is", () => {
    for (let i = 0; i < 500; i++) {
      const p = { x: 100 + (Math.random() - 0.5) * 500, y: 100 + (Math.random() - 0.5) * 500 };
      const { dx, dy } = pupilOffset(eye, p);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(TOAD_RULES.maxPupilPx + 0.01);
    }
  });

  it("moves only part way when the mouse is right on the eye, and ignores bad numbers", () => {
    expect(pupilOffset(eye, eye)).toEqual({ dx: 0, dy: 0 });
    const near = pupilOffset(eye, { x: 110, y: 100 });
    expect(near.dx).toBeGreaterThan(0);
    expect(near.dx).toBeLessThan(TOAD_RULES.maxPupilPx);
    expect(pupilOffset(eye, { x: Number.NaN, y: 100 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe("idle moves are rare", () => {
  it("always waits between 1 and 2 minutes", () => {
    for (const r of [0, 0.25, 0.5, 0.999, 1, -3, 7, Number.NaN]) {
      const ms = nextIdleDelay(r);
      expect(ms).toBeGreaterThanOrEqual(60_000);
      expect(ms).toBeLessThanOrEqual(120_000);
    }
  });

  it("blinks most often", () => {
    expect(pickIdleMove(0)).toBe("blink");
    expect(pickIdleMove(0.49)).toBe("blink");
    expect(["glance", "hop", "wiggle"]).toContain(pickIdleMove(0.9));
  });
});

describe("when the toad may move", () => {
  const calm = { mode: "on" as const, reducedMotion: false, tabHidden: false, typing: false, dialogOpen: false };

  it("moves normally", () => expect(mayMove(calm)).toBe(true));

  it("stays still with reduce motion, calm mode, a hidden tab, typing or an open dialog", () => {
    expect(mayMove({ ...calm, reducedMotion: true })).toBe(false);
    expect(mayMove({ ...calm, mode: "calm" })).toBe(false);
    expect(mayMove({ ...calm, mode: "hidden" })).toBe(false);
    expect(mayMove({ ...calm, tabHidden: true })).toBe(false);
    expect(mayMove({ ...calm, typing: true })).toBe(false);
    expect(mayMove({ ...calm, dialogOpen: true })).toBe(false);
  });

  it("tucked away: no idle moves, but his peeking eyes may still follow (unless reduce motion)", () => {
    expect(mayMove({ ...calm, mode: "hidden" })).toBe(false);
    expect(eyesMayFollow({ ...calm, mode: "hidden" })).toBe(true);
    expect(eyesMayFollow({ ...calm, mode: "hidden", reducedMotion: true })).toBe(false);
    expect(eyesMayFollow({ ...calm, mode: "calm" })).toBe(false);
  });

  it("reads the saved choice safely", () => {
    expect(parseToadMode("calm")).toBe("calm");
    expect(parseToadMode("hidden")).toBe("hidden");
    expect(parseToadMode(undefined)).toBe("on");
    expect(parseToadMode("<script>")).toBe("on");
  });
});

// ---------------------------------------------------------------------------
// Phase 2: what the AI is given, and how its answer is checked (0030).
// ---------------------------------------------------------------------------

const roster = [
  { id: "sample-plumbing", name: "Sample Plumbing (fictional)" },
  { id: "demo-roofing", name: "Demo Roofing Co (fictional)" },
] as unknown as RosterClient[];
const book = buildCodebook(roster);
const staff = buildStaffBook([{ id: "s1", name: "Alex Sample" }, { id: "s2", name: "Jordan Example" }]);

function keysDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (typeof v === "object" && v !== null)
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keysDeep(x, out);
    }
  return out;
}

const baseInput = (): ToadFactsInput => ({
  today: "2026-11-24",
  askerRole: "manager",
  askerCode: "T1",
  screens: TOAD_SCREENS.full,
  clients: [
    { code: "C1", status: "active", monthly_usd: 900, health: { word: "watch" }, health_score: { value: 62 }, recent_contact_notes: [{ note: "Call me at 330-555-0142 or owner@example.com" }] },
    { code: "C2", status: "active", monthly_usd: 450, extra: { invoice_total: 12, nested: [{ price: 3, ok: 1 }] } },
  ],
  workOrders: [{ title: "Fix homepage speed", client: "C1", owner: "T2", due: "2026-11-20", overdue: true }],
  team: [{ code: "T1", role: "manager", open_hours: 4 }],
  rankedPlan: [{ rank: 1, client: "C1" }],
  riskAlerts: [{ client: "C1", score: 40 }],
  pipeline: { open_deals: 4, by_stage: [{ stage: "New", count: 2 }], open_value_usd: 5000 },
});

describe("BizToad facts never carry money or contact details", () => {
  it("removes every money-looking field at any depth, for any role", () => {
    for (const askerRole of ["owner", "manager"]) {
      const facts = buildToadFacts({ ...baseInput(), askerRole });
      const bad = keysDeep(facts).filter((k) => MONEY_KEY.test(k));
      expect(bad).toEqual([]);
      expect(JSON.stringify(facts)).not.toMatch(/900|450|5000/);
    }
  });

  it("keeps the useful facts (health score value, counts)", () => {
    const facts = buildToadFacts(baseInput()) as unknown as { clients: { health_score?: { value: number } }[]; sales_pipeline: { open_deals: number } };
    expect(facts.clients[0]?.health_score?.value).toBe(62);
    expect(facts.sales_pipeline.open_deals).toBe(4);
  });

  it("blanks emails and phone numbers in free text", () => {
    const text = JSON.stringify(buildToadFacts(baseInput()));
    expect(text).not.toMatch(/330-555-0142|owner@example\.com/);
    expect(scrubContacts("Text (330) 555-0199 now")).toBe("Text [phone removed] now");
    expect(scrubContacts("Due 2026-11-20, 3 items")).toBe("Due 2026-11-20, 3 items");
    expect(stripMoney({ a: "x@example.com" })).toEqual({ a: "[email removed]" });
  });

  it("trims to the size limit, dropping notes before clients", () => {
    const input = baseInput();
    input.clients = Array.from({ length: 200 }, (_, i) => ({ code: `C${i + 1}`, status: "active", recent_contact_notes: [{ note: "x".repeat(300) }], open_items: [{ title: "y".repeat(100) }] }));
    input.workOrders = Array.from({ length: 200 }, (_, i) => ({ title: `Order ${i}`, due: "2026-11-30" }));
    const facts = buildToadFacts(input, 20_000) as unknown as { clients: Record<string, unknown>[]; open_work_orders: unknown[] };
    expect(JSON.stringify(facts).length).toBeLessThanOrEqual(20_000);
    expect(facts.clients.some((c) => "recent_contact_notes" in c)).toBe(false);
    expect((facts.clients[0] as { code: string }).code).toBe("C1"); // most urgent kept
    expect(facts.open_work_orders.length).toBeLessThanOrEqual(60);
  });
});

describe("BizToad never passes on dollar amounts written in text", () => {
  it("blanks amounts in notes, reasons and titles", () => {
    expect(scrubMoney("Multi-service client at $750/mo, was $1,200 a month")).toBe("Multi-service client at [amount removed], was [amount removed]");
    expect(scrubMoney("Grade A · $750–$1.2K/mo potential")).not.toMatch(/\$/);
    expect(scrubMoney("USD 300 per month")).toBe("[amount removed]");
    expect(scrubMoney("they pay 750/mo, maybe 1.2K per month")).toBe("they pay [amount removed], maybe [amount removed]");
    expect(scrubMoney("3 items, 8 open hours, due 2026-11-20")).toBe("3 items, 8 open hours, due 2026-11-20");
  });

  it("the sales pipeline goes in as counts only, never deal values", () => {
    const p = pipelineCounts({
      synced_at: "2026-11-24",
      open_deals: { count: 315, value: 84610.97 },
      by_stage: [{ stage: "New", count: 2, value: 999 } as { stage: string; count: number }],
      new_this_month: 3,
      won_this_month: { count: 1, value: 155 },
      lost_this_month: 0,
      appointments_next_7_days: 2,
      showed_last_30_days: 1,
      no_shows_last_30_days: 0,
    });
    expect(p?.open_deals).toBe(315);
    expect(JSON.stringify(p)).not.toMatch(/84610|155|999/);
    // Second lock: a { count, value } pair loses its value wherever it appears.
    expect(stripMoney({ deals: { count: 4, value: 5000 }, health_score: { value: 62 } })).toEqual({ deals: { count: 4 }, health_score: { value: 62 } });
  });

  it("no $ figure survives in the facts or in an answer", () => {
    const input = baseInput();
    input.clients[0] = { code: "C1", health: { reasons: ["Only multi-service client at $750/mo"] } };
    input.rankedPlan = [{ why: ["$950/mo at risk"] }];
    expect(JSON.stringify(buildToadFacts(input))).not.toMatch(/\$\d/);
    const a = restoreToadAnswer({ answer: "[C1] pays $950/mo.", points: [{ text: "Was $500", source: "notes" }], unknowns: [], links: [] }, book, staff, TOAD_SCREENS.full);
    expect(JSON.stringify(a)).not.toMatch(/\$\d/);
  });
});

describe("BizToad questions and history are cleaned", () => {
  it("swaps client and team names for codes and blanks contacts", () => {
    const q = cleanQuestion("What does Alex Sample owe Sample Plumbing (fictional)? Email bob@example.com", book, staff);
    expect(q).not.toMatch(/Alex Sample|Sample Plumbing|bob@example/);
    expect(q).toMatch(/\[T1\]/);
    expect(q).toMatch(/\[C1\]/);
  });

  it("caps length and strips hidden characters", () => {
    expect(cleanQuestion("a".repeat(5000), book, staff).length).toBe(1000);
    expect(cleanQuestion("hi\u0000there", book, staff)).toBe("hi there");
    expect(cleanQuestion(42, book, staff)).toBe("");
  });

  it("keeps only the last 6 turns, each cleaned", () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({ q: `Question ${i} about Demo Roofing Co (fictional)`, a: "Answer" }));
    const h = cleanHistory(turns, book, staff);
    expect(h).toHaveLength(6);
    expect(h[0]?.q).toMatch(/Question 4/);
    expect(h.every((t) => !t.q.includes("Demo Roofing"))).toBe(true);
    expect(cleanHistory("nope", book, staff)).toEqual([]);
    expect(cleanHistory([{ q: 5 }, null], book, staff)).toEqual([]);
  });
});

describe("BizToad answers are checked", () => {
  it("keeps only links to this person's own screens", () => {
    const links = safeToadLinks(
      [{ label: "Bad", path: "https://evil.example.com" }, { label: "Billing", path: "/billing" }, { label: "Work orders", path: "/work/orders" }, { label: "Dup", path: "/work/orders" }],
      TOAD_SCREENS.full,
    );
    expect(links).toEqual([{ label: "Work orders", path: "/work/orders" }]);
    expect(safeToadLinks([{ path: "/clients" }], TOAD_SCREENS.developer)).toEqual([]);
  });

  it("no role's screen list includes billing or trash", () => {
    for (const list of Object.values(TOAD_SCREENS)) expect(list.some((s) => /billing|trash/.test(s.path))).toBe(false);
  });

  it("swaps codes back to names and limits lengths", () => {
    const a = restoreToadAnswer(
      { answer: "[C1] needs a check-in; ask [T2].", points: Array.from({ length: 9 }, () => ({ text: "p", source: "s" })), unknowns: ["u"], links: [{ label: "x", path: "/" }] },
      book,
      staff,
      TOAD_SCREENS.full,
    );
    expect(a.answer).toBe("Sample Plumbing (fictional) needs a check-in; ask Jordan Example.");
    expect(a.points).toHaveLength(5);
    expect(a.links).toHaveLength(1);
    expect(restoreToadAnswer(null, book, staff, TOAD_SCREENS.full).answer).toMatch(/couldn't/);
  });
});

describe("BizToad voice (Phase 4)", () => {
  it("reads the answer and its points, not links, sources or costs", () => {
    const t = speechText({ answer: "Six work orders are overdue.", points: [{ text: "One is blocked." }, { text: "  Two have [no] owner • " }] });
    expect(t).toBe("Six work orders are overdue. One is blocked. Two have no owner");
    expect(speechText({ answer: "x".repeat(5000), points: [] }).length).toBe(1500);
  });

  it("prefers an English voice that runs on this device", () => {
    const voices = [
      { name: "Cloud", lang: "en-US", localService: false, default: true },
      { name: "French", lang: "fr-FR", localService: true },
      { name: "UK", lang: "en-GB", localService: true },
      { name: "US", lang: "en-US", localService: true },
    ];
    expect(pickVoice(voices)?.name).toBe("US");
    expect(pickVoice(voices.slice(0, 3))?.name).toBe("UK");
    expect(pickVoice([voices[0]!, voices[1]!])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 3: developers and salespeople. All names below are fictional.
// ---------------------------------------------------------------------------

/** Every key at any depth (to prove what a role's facts can never contain). */
function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      allKeys(x, out);
    }
  return out;
}

describe("BizToad picks facts by database role", () => {
  it("owner and managers get the full facts; developers and sales their own", () => {
    expect(toadModeFor("owner")).toBe("full");
    expect(toadModeFor("manager")).toBe("full");
    expect(toadModeFor("developer")).toBe("developer");
    expect(toadModeFor("sales")).toBe("sales");
    expect(toadModeFor("va")).toBeNull(); // VAs (0033) never get BizToad
  });
});

describe("lead and prospect names get codes too", () => {
  const leads = buildNameBook("L", [
    { id: "g1", name: "Robin Example Roofing (fictional)" },
    { id: "g2", name: "Al" },
    { id: "g1", name: "duplicate id is ignored" },
  ]);
  it("swaps full names for codes and back, and skips very short names", () => {
    expect(leads.codeOf.get("g1")).toBe("L1");
    expect(leads.nameOf.size).toBe(2);
    expect(redactNames("Call robin example roofing (fictional) today, and Al too", leads)).toBe("Call [L1] today, and Al too");
    expect(restoreNames("Start with [L1], then L2.", leads)).toBe("Start with Robin Example Roofing (fictional), then Al.");
  });
  it("leaves unknown codes alone", () => {
    expect(restoreNames("See L9 and P1", leads)).toBe("See L9 and P1");
  });
  it("restores lead codes in answers", () => {
    const a = restoreToadAnswer({ answer: "Call [L1] first.", points: [], unknowns: [], links: [] }, codebookFor([]), buildStaffBook([]), TOAD_SCREENS.sales, [leads]);
    expect(a.answer).toBe("Call Robin Example Roofing (fictional) first.");
  });
  it("swaps lead names in the question", () => {
    expect(cleanQuestion("What about Robin Example Roofing (fictional)?", codebookFor([]), buildStaffBook([]), [leads])).toBe("What about [L1]?");
  });
});

const devWork: ClientAction[] = [
  {
    id: "a1", kind: "work_order", title: "Fix the contact form for Pat Example (fictional), $750/mo plan", notes: "private note", priority: "high", status: "in_progress",
    dueOn: "2026-11-20", doneAt: null, createdAt: "2026-11-01", ownerId: "s1", ownerName: "Dev Sample", client: { slug: "pat", dbId: "", name: "Pat Example (fictional)" },
    leadGhlId: null, steps: "Check the form\nSend a test", stepsDone: [1], estMinutes: 60, sentBackCount: 1, reviewNote: "Email pat@example.com when done", blockedReason: null, promisedOn: null,
  },
  { id: "a2", kind: "work_order", title: "Old finished job", notes: null, priority: "normal", status: "done", dueOn: "2026-11-18", doneAt: "2026-11-19T10:00:00Z", createdAt: "2026-11-01", ownerId: "s1", ownerName: "Dev Sample", client: null, leadGhlId: null, internal: true },
  { id: "a3", kind: "work_order", title: "Canceled job", notes: null, priority: "normal", status: "open", dueOn: null, doneAt: null, createdAt: "2026-11-01", ownerId: "s1", ownerName: "Dev Sample", client: null, leadGhlId: null, canceledAt: "2026-11-02" },
];
const devContacts: ClientContactDates[] = [{ slug: "pat", name: "Pat Example (fictional)", lastLoggedOn: "2026-11-10", lastInboundAt: "2026-11-15T09:00:00Z", lastOutboundAt: null, lastCallAt: null, unanswered: 0 }];

describe("a developer's BizToad sees only their own work", () => {
  const book = codebookFor([{ id: "pat", name: "Pat Example (fictional)" }]);
  const staff = buildStaffBook([{ id: "s1", name: "Dev Sample" }]);
  const facts = buildDeveloperToadFacts({ today: "2026-11-24", askerCode: "T1", work: devWork, contacts: devContacts, book, staff });
  const text = JSON.stringify(facts);

  it("lists their open work with steps, due dates and review notes, coded", () => {
    expect(facts.my_open_work).toHaveLength(1);
    const w = facts.my_open_work[0]!;
    expect(w).toMatchObject({ client: "C1", status: "in_progress", due: "2026-11-20", overdue: true, sent_back_times: 1 });
    expect(w.steps).toEqual([{ step: "Check the form", done: true }, { step: "Send a test", done: false }]);
    expect(facts.my_done_last_14_days.count).toBe(1);
    expect(facts.my_client_contacts[0]).toMatchObject({ client: "C1", last_contact: "2026-11-15" });
    expect(facts.screens).toEqual(TOAD_SCREENS.developer);
  });

  it("never carries client names, money, contact details, health, team load or sales", () => {
    expect(text).not.toMatch(/Pat Example|750|pat@example\.com|private note/);
    const keys = allKeys(facts);
    for (const k of ["health", "score", "team_load", "risk_alerts", "ranked_plan", "sales_pipeline", "clients", "notes", "owner"]) expect(keys.has(k)).toBe(false);
    for (const k of keys) expect(MONEY_KEY.test(k)).toBe(false);
  });

  it("stays within the size limit", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ ...devWork[0]!, id: `x${i}`, title: `Job ${i} ${"y".repeat(100)}` }));
    const small = buildDeveloperToadFacts({ today: "2026-11-24", askerCode: null, work: many, contacts: devContacts, book, staff }, 6000);
    expect(JSON.stringify(small).length).toBeLessThanOrEqual(6000);
    expect(small.my_open_work.length).toBeGreaterThan(0);
  });
});

const lead = (id: string, assigned: string | null, extra: Partial<SalesLead> = {}): SalesLead => ({
  ghlId: id, name: `Lead ${id} (fictional)`, pipelineId: "p1", pipelineName: "Main", stage: "New", status: "open", value: 5000, source: null,
  createdAt: "2026-11-20T15:00:00Z", updatedAt: null, statusChangedAt: null, assignedUserId: assigned, ...extra,
});
const prospect = (id: string, assignedTo: string | null, status: Prospect["status"] = "new"): Prospect => ({
  id, name: `Prospect ${id} (fictional)`, website: "https://example.com", category: "Roofer", address: "1 Main St", town: "Sampletown", lat: 1, lng: 1,
  mapsUrl: null, rating: 4.5, reviews: 10, signals: {} as Prospect["signals"], score: 70, reasons: ["No website"], angle: "website", status, assignedTo, nextOkOn: null, runId: null, createdAt: "2026-11-20",
});

describe("a salesperson's BizToad sees only their own leads", () => {
  const leads = [lead("mine", "ghl-me"), lead("pool", null), lead("theirs", "ghl-other"), lead("won", "ghl-me", { status: "won" })];
  const leadBook = buildNameBook("L", leads.map((l) => ({ id: l.ghlId, name: l.name })));
  const prospects = [prospect("p-mine", "u-me"), prospect("p-pool", null), prospect("p-theirs", "u-other"), prospect("p-closed", null, "won")];
  const prospectBook = buildNameBook("P", prospects.map((p) => ({ id: p.id, name: p.name })));
  const input: ToadSalesInput = {
    today: "2026-11-24",
    askerCode: null,
    me: { userId: "u-me", ghlUserId: "ghl-me" },
    pipelines: [{ id: "p1", name: "Main", hotStages: ["New"], active: true }],
    leads,
    touches: [
      { leadId: "mine", kind: "call", at: "2026-11-24T15:00:00Z", by: "u-me" },
      { leadId: "theirs", kind: "call", at: "2026-11-24T15:00:00Z", by: "u-other" },
    ],
    followUps: [
      { id: "f1", leadId: "mine", title: "Call back Lead mine (fictional) about the $2,000 quote", dueOn: "2026-11-23", status: "open", ownerStaffId: null },
      { id: "f2", leadId: "theirs", title: "Their follow-up", dueOn: "2026-11-23", status: "open", ownerStaffId: null },
    ],
    myTarget: 15,
    appointments: [{ startsAt: "2026-11-25T15:00:00Z", calendar: "Discovery call", status: "confirmed" }],
    prospects,
    visits: [
      { prospectId: "p-mine", kind: "walk_in", outcome: "interested", at: "2026-11-23T15:00:00Z", by: "u-me" },
      { prospectId: "p-theirs", kind: "walk_in", outcome: "interested", at: "2026-11-23T15:00:00Z", by: "u-other" },
    ] as ToadSalesInput["visits"],
    board: [
      { isMe: true, linked: true, wonDeals: 2 },
      { isMe: false, linked: true, wonDeals: 5 },
      { isMe: false, linked: false, wonDeals: 0 },
    ],
    leadBook,
    prospectBook,
  };
  const facts = buildSalesToadFacts(input);
  const text = JSON.stringify(facts);

  it("own leads are theirs plus unassigned; unlinked people get only unassigned", () => {
    expect(mySalesLeads(leads, "ghl-me").map((l) => l.ghlId)).toEqual(["mine", "pool"]);
    expect(mySalesLeads(leads, null).map((l) => l.ghlId)).toEqual(["pool"]);
  });

  it("lists their leads, follow-ups, reach-outs, Scout pool and deal rank", () => {
    expect(facts.my_open_leads.map((l) => l.lead)).toEqual([leadBook.codeOf.get("mine"), leadBook.codeOf.get("pool")]);
    expect(facts.my_follow_ups).toHaveLength(1);
    expect(facts.my_follow_ups[0]).toMatchObject({ lead: "L1", overdue: true });
    expect(facts.reach_outs_today).toMatchObject({ done: 1, target: 15 });
    expect(facts.scout_prospects.map((p) => p.prospect).sort()).toEqual(["P1", "P2"]);
    expect(facts.my_scout_visits_last_7_days.count).toBe(1);
    expect(facts.leaderboard).toEqual({ my_won_deals: 2, my_rank_by_deals: 2, people_ranked: 2 });
  });

  it("never carries names, money, websites, addresses, other reps' leads, clients or work orders", () => {
    expect(text).not.toMatch(/fictional|5000|2,000|example\.com|1 Main St|Their follow-up|theirs/);
    const keys = allKeys(facts);
    for (const k of ["value", "clients", "open_work_orders", "team_load", "health", "name", "website", "address"]) expect(keys.has(k)).toBe(false);
    for (const k of keys) expect(MONEY_KEY.test(k)).toBe(false);
  });
});
