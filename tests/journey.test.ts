// Client journey (Step 1B): the 27 touches, stages, next touch, Grow rhythm, and guardrails.
// All names here are fictional.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asOutcome, dayProgress, nextWorkingDay, restartSchedule, touchPoints } from "@/lib/journey";
import { asStatusReason, asTouchChannel, draftMessage, touchesDue, GROW_TOUCHES, JOURNEY_STAGES, JOURNEY_TOUCHES, journeyLabel, journeyState, touchByStep, type TouchLog } from "@/lib/journey";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const done = (step: number, happenedOn: string): TouchLog => ({ step, status: "done", happenedOn });

describe("the 27-touch plan", () => {
  it("has 27 touches, numbered 1-27, in day order, over about 90 days", () => {
    expect(JOURNEY_TOUCHES).toHaveLength(27);
    expect(JOURNEY_TOUCHES.map((t) => t.step)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    for (let i = 1; i < 27; i++) expect(JOURNEY_TOUCHES[i]!.day).toBeGreaterThanOrEqual(JOURNEY_TOUCHES[i - 1]!.day);
    expect(JOURNEY_TOUCHES[26]!.day).toBeLessThanOrEqual(100);
  });

  it("groups them into the 5 onboarding stages the owner approved, then Grow", () => {
    expect(JOURNEY_STAGES).toEqual(["Kickoff", "First results", "Month 2", "Month 3", "90-day wrap", "Grow"]);
    const stageOf = (s: number) => JOURNEY_TOUCHES.find((t) => t.step === s)!.stage;
    expect([1, 4].map(stageOf)).toEqual([0, 0]);
    expect([5, 9].map(stageOf)).toEqual([1, 1]);
    expect([10, 18].map(stageOf)).toEqual([2, 2]);
    expect([19, 23].map(stageOf)).toEqual([3, 3]);
    expect([24, 26, 27].map(stageOf)).toEqual([4, 4, 4]);
    expect(touchByStep(26)!.title).toBe("Survey");
    expect(touchByStep(27)!.title).toBe("Referral ask");
    expect(GROW_TOUCHES.map((t) => t.step)).toEqual([101, 102, 103]);
  });

  it("matches the numbers the database allows (1-27 and 101-103)", () => {
    const sql = read("supabase/migrations/0028_client_journey.sql");
    expect(sql).toMatch(/step between 1 and 27 or step between 101 and 103/);
  });

  it("drafts are copy-only, fill in the business, and never carry real names", () => {
    const d = draftMessage(touchByStep(2)!, "Sample Plumbing (fictional)");
    expect(d).toContain("Sample Plumbing (fictional)");
    expect(d).toContain("[First name]");
    expect(d).not.toContain("[Business]");
    // Touches without a template still get a short draft.
    expect(draftMessage(touchByStep(12)!, "X")).toMatch(/^Hi \[First name\], results so far/);
    for (const t of [...JOURNEY_TOUCHES, ...GROW_TOUCHES]) expect(t.template ?? "").not.toMatch(/@|\d{3}-\d{4}/);
  });
});

describe("where a client is on the journey", () => {
  const today = "2026-11-24";

  it("a new client starts at touch 1 on day 1", () => {
    const j = journeyState({ startedOn: "2026-11-24", touches: [], today });
    expect(j).toMatchObject({ mode: "onboarding", stage: 0, handled: 0, next: { step: 1, due: "2026-11-24", overdue: false } });
    expect(j.ticks[0]).toBe("next");
    expect(j.ticks.filter((t) => t === "todo")).toHaveLength(26);
  });

  it("done and skipped both move it on; the next touch is due on start + its day", () => {
    const j = journeyState({ startedOn: "2026-11-01", touches: [done(1, "2026-11-01"), done(2, "2026-11-01"), { step: 3, status: "skipped", happenedOn: "2026-11-03" }], today });
    expect(j.next).toMatchObject({ step: 4, due: "2026-11-08", overdue: true });
    expect(j.ticks.slice(0, 4)).toEqual(["done", "done", "skipped", "next"]);
    expect(j.handled).toBe(3);
  });

  it("moves through the stages", () => {
    const upTo = (n: number) => Array.from({ length: n }, (_, i) => done(i + 1, "2026-10-01"));
    expect(journeyState({ startedOn: "2026-09-01", touches: upTo(4), today }).stage).toBe(1);
    expect(journeyState({ startedOn: "2026-09-01", touches: upTo(11), today }).stage).toBe(2);
    expect(journeyState({ startedOn: "2026-09-01", touches: upTo(23), today }).stage).toBe(4);
  });

  it("restarting the journey ignores touches from before the restart", () => {
    const j = journeyState({ startedOn: "2026-11-20", touches: [done(1, "2026-06-01"), done(2, "2026-06-01")], today });
    expect(j.next?.step).toBe(1);
  });

  it("after all 27 it moves to Grow: monthly report first, then the mid-month check-in", () => {
    const all = JOURNEY_TOUCHES.map((t) => done(t.step, "2026-08-20"));
    const j = journeyState({ startedOn: "2026-08-01", touches: all, today, plan: { reportEveryDays: 30, midMonthCheckIn: true, competitorReviewMonths: 3 } });
    expect(j.mode).toBe("grow");
    expect(j.stage).toBe(5);
    // Journey ended Oct 30 (start + 90): check-in due mid-month, report a month on.
    expect(j.next).toMatchObject({ step: 102, due: "2026-11-14", overdue: true });
    const after = journeyState({ startedOn: "2026-08-01", touches: [...all, done(102, "2026-11-14")], today, plan: { reportEveryDays: 30, midMonthCheckIn: true, competitorReviewMonths: 3 } });
    expect(after.next).toMatchObject({ step: 101, due: "2026-11-29" });
  });

  it("existing clients start in Grow, counted from their last contact (no pile of overdue touches)", () => {
    const j = journeyState({ touches: [], lastContact: "2026-11-10", today, plan: { reportEveryDays: 30, midMonthCheckIn: false, competitorReviewMonths: 0 } });
    expect(j).toMatchObject({ mode: "grow", stage: 5, startedOn: null, next: { step: 101, due: "2026-12-10", overdue: false } });
    expect(j.ticks.every((t) => t === "todo")).toBe(true);
    const never = journeyState({ touches: [], today });
    expect(never.next?.overdue).toBe(false);
  });

  it("labels read well on the client list", () => {
    const j = journeyState({ startedOn: "2026-10-01", touches: Array.from({ length: 11 }, (_, i) => done(i + 1, "2026-10-20")), today });
    expect(journeyLabel(j, (d) => d)).toBe("Month 2 · 45-day check-in call · overdue since 2026-11-15");
  });
});

describe("touches due on Home", () => {
  const today = "2026-11-24";
  const j = (due: string) => ({ mode: "onboarding" as const, stage: 0, ticks: [], handled: 0, startedOn: "2026-11-01", next: { step: 1, title: "Kickoff call", how: "Call", due, overdue: due < today, attempts: 0 } });
  const journeys = new Map([
    ["a", j("2026-11-24")],
    ["b", j("2026-11-20")],
    ["c", j("2026-11-20")],
    ["d", j("2026-12-01")],
  ]);
  const clients = [
    { id: "a", name: "A (fictional)", ownerId: "me" },
    { id: "b", name: "B (fictional)", ownerId: "other", backupId: "me" },
    { id: "c", name: "C (fictional)", ownerId: "other" },
    { id: "d", name: "D (fictional)", ownerId: "me" },
  ];

  it("shows mine due today or overdue, plus overdue ones I back up", () => {
    const due = touchesDue(clients, journeys, "me", today);
    expect(due.map((d) => [d.slug, d.as])).toEqual([["b", "backup"], ["a", "main"]]);
  });

  it("someone not linked to a team profile sees everyone's", () => {
    expect(touchesDue(clients, journeys, null, today).map((d) => d.slug)).toEqual(["b", "c", "a"]);
  });
});

describe("calls first (0029)", () => {
  it("an unanswered call keeps the touch open and brings it back the next working day", () => {
    const j = journeyState({ startedOn: "2026-11-20", touches: [{ step: 1, status: "attempt", happenedOn: "2026-11-20" }], today: "2026-11-24" });
    // Fri Nov 20 → Mon Nov 23 (weekend skipped).
    expect(j.next).toMatchObject({ step: 1, due: "2026-11-23", attempts: 1, overdue: true });
    expect(j.ticks[0]).toBe("next");
  });

  it("points: a real conversation 3, voicemail + text 1, text or email 1, skip 0", () => {
    expect(touchPoints({ step: 1, status: "done", channel: "call", outcome: "talked" })).toBe(3);
    expect(touchPoints({ step: 1, status: "done", channel: "call", outcome: null })).toBe(3);
    expect(touchPoints({ step: 1, status: "attempt", channel: "call", outcome: "voicemail" })).toBe(1);
    expect(touchPoints({ step: 2, status: "done", channel: "text", outcome: "text_instead" })).toBe(1);
    expect(touchPoints({ step: 2, status: "skipped", channel: null, outcome: null })).toBe(0);
    const p = dayProgress(
      [
        { step: 1, status: "done", channel: "call", outcome: "talked" },
        { step: 4, status: "done", channel: "text", outcome: null },
        { step: 12, status: "attempt", channel: "call", outcome: "voicemail" },
      ],
      15,
    );
    expect(p).toEqual({ points: 5, goal: 15, calls: 1, moved: 1, pct: 33 });
  });

  it("restart: 4 a day, weekends skipped, in the order given", () => {
    const clients = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}` }));
    const plan = restartSchedule(clients, "2026-11-27"); // a Friday
    expect(plan.map((p) => p.start)).toEqual([
      "2026-11-27", "2026-11-27", "2026-11-27", "2026-11-27",
      "2026-11-30", "2026-11-30", "2026-11-30", "2026-11-30",
      "2026-12-01",
    ]);
    expect(restartSchedule([{ id: "a" }], "2026-11-28")[0]!.start).toBe("2026-11-30"); // Saturday → Monday
    expect(nextWorkingDay("2026-11-24")).toBe("2026-11-25");
  });

  it("only known outcomes", () => {
    expect(asOutcome("voicemail")).toBe("voicemail");
    expect(asOutcome("shouted")).toBeNull();
  });
});

describe("input checks", () => {
  it("only known reasons and channels", () => {
    expect(asStatusReason("price")).toBe("price");
    expect(asStatusReason("back")).toBeNull();
    expect(asStatusReason("hacked")).toBeNull();
    expect(asTouchChannel("video")).toBe("video");
    expect(asTouchChannel("fax")).toBeNull();
  });
});

describe("journey guardrails", () => {
  const actions = read("src/app/actions.ts");
  const slice = (from: string, to: string) => actions.slice(actions.indexOf(from), actions.indexOf(to));

  it("status changes: owner or manager, reason required, logged BEFORE the client changes", () => {
    const fn = slice("export async function setClientStatus", "export async function logTouch");
    expect(fn).toMatch(/!isLead\(me\.role\)/);
    expect(fn).toMatch(/asStatusReason\(/);
    const log = fn.indexOf('from("client_status_changes").insert');
    const update = fn.indexOf('from("clients").update');
    expect(log).toBeGreaterThan(0);
    expect(update).toBeGreaterThan(log);
    expect(fn).not.toMatch(/\.delete\(/);
  });

  it("restart and goals are owner-only and delete nothing", () => {
    const restart = slice("export async function restartAllJourneys", "export async function saveCareTarget");
    expect(restart).toMatch(/me\.role !== "owner"\) return;/);
    expect(restart).toMatch(/restartSchedule\(/);
    expect(restart).not.toMatch(/\.delete\(/);
    const goal = slice("export async function saveCareTarget", "type CareAiState");
    expect(goal).toMatch(/me\.role !== "owner"\) return;/);
  });

  it("the AI helper: budget check first, names as codes, cost logged, nothing saved or sent", () => {
    for (const [from, to, feature] of [
      ["export async function suggestNextMoves", "export async function draftTouchMessage", "care_suggestions"],
      ["export async function draftTouchMessage", "/** Who owns a client", "care_draft"],
    ] as const) {
      const fn = slice(from, to);
      expect(fn).toMatch(/const pre = await aiPreflight\(\);/);
      expect(fn).toMatch(/buildCodebook\(/);
      expect(fn).toMatch(/redact\(/);
      expect(fn).toMatch(new RegExp(`logAiUsage\\(db, "${feature}", result\\)`));
      expect(fn).not.toMatch(/\.insert\(|\.update\(|\.delete\(|fetch\(/);
      // Client names never go in the data: only codes and short, redacted notes.
      expect(fn).not.toMatch(/name: c\.name|client\.name,/);
    }
  });

  it("touches: Done also logs a check-in; nothing is sent", () => {
    const fn = slice("export async function logTouch", "export async function startOnboarding");
    expect(fn).toMatch(/from\("care_touches"\)\.insert/);
    expect(fn).toMatch(/from\("check_ins"\)\.insert/);
    expect(fn).not.toMatch(/fetch\(|ghl|send/i);
  });
});
