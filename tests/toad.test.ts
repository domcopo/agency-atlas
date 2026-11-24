// BizToad (docs/BIZTOAD_PLAN.md): motion rules (Phase 1) and what the AI is given (Phase 2).
import { describe, expect, it } from "vitest";
import { eyesMayFollow, mayMove, nextIdleDelay, parseToadMode, pickIdleMove, pupilOffset, TOAD_RULES } from "@/lib/toad";
import { buildCodebook, buildStaffBook } from "@/lib/ai/snapshot";
import { buildToadFacts, pipelineCounts, cleanHistory, cleanQuestion, MONEY_KEY, restoreToadAnswer, safeToadLinks, scrubContacts, scrubMoney, stripMoney, TOAD_SCREENS, type ToadFactsInput } from "@/lib/ai/toad-snapshot";
import type { RosterClient } from "@/lib/types";

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

  it("never slides further than the limit (inside the iris), wherever the mouse is", () => {
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
