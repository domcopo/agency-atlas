// Checks the app's data rules:
// - sample data is clearly fake and never tied to a real client or team member
// - every link between records points somewhere real
// - the private client-file checker rejects bad input
// - untrusted message text can't change anything

import { describe, expect, it } from "vitest";
import { demoRosterRaw } from "@/fixtures/demo-roster";
import { missionControl as sampleHome } from "@/fixtures/mission-control";
import {
  DATA_MODE,
  getBusinesses,
  getCaseStudyHistory,
  getConversations,
  getInsights,
  getMissionControl,
  getProspects,
  getProspectsToWork,
  getRoster,
  getRosterSummary,
  getSafetyStatus,
  getSampleDevelopers,
  getSurveyQuestions,
  getSurveyResponses,
  getTrends,
  getWorkOrders,
  tierOf,
} from "@/lib/data-source";
import { describeTenure, monthsBetween } from "@/lib/format";
import { parseRoster } from "@/lib/private-data";

const businesses = getBusinesses();
const prospects = getProspects();
const conversations = getConversations();
const work = getWorkOrders();
const trends = getTrends();
const insights = getInsights();
const questions = getSurveyQuestions();
const answers = getSurveyResponses();
const mc = getMissionControl();

const businessIds = new Set(businesses.map((b) => b.id));
const prospectIds = new Set(prospects.map((p) => p.id));
const trendIds = new Set(trends.map((t) => t.id));

describe("sample data is clearly fake", () => {
  it("runs with no outside connections", () => {
    expect(DATA_MODE).toBe("mock");
    expect(getSafetyStatus().dataMode).toBe("mock");
  });

  it("marks every sample record as synthetic", () => {
    const records = [
      ...businesses,
      ...prospects,
      ...conversations,
      ...work,
      ...trends,
      ...insights,
      ...answers,
      ...mc.followUps,
      ...sampleHome.alerts,
      ...sampleHome.activity,
    ];
    for (const r of records) expect(r.isSynthetic, r.id).toBe(true);
  });

  it("uses unique ids", () => {
    const ids = [...businesses, ...prospects, ...conversations, ...work, ...trends, ...insights, ...answers, ...mc.followUps].map(
      (r) => r.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prospects have obviously fake names and contact details", () => {
    for (const p of prospects) {
      expect(p.name, p.id).toContain("(sample)");
      expect(p.contactName, p.id).toContain("(fictional)");
      expect(p.email, p.id).toMatch(/@([a-z0-9-]+\.)?example\.com$/);
      expect(p.phone, p.id).toMatch(/^555-01\d\d$/);
      expect(p.estMonthlyUsd.high, p.id).toBeGreaterThanOrEqual(p.estMonthlyUsd.low);
    }
  });

  it("sample work is never attached to a real client or team member", () => {
    const devIds = new Set(getSampleDevelopers().map((d) => d.id));
    for (const w of work) {
      expect(w.clientLabel, w.id).toMatch(/^Sample client/);
      expect(devIds.has(w.assignee), w.id).toBe(true);
      expect(w.checklist.length, w.id).toBeGreaterThan(0);
    }
    for (const d of getSampleDevelopers()) expect(d.name).toContain("(sample)");
  });

  it("demo roster names are fictional", () => {
    for (const c of demoRosterRaw.clients) expect(c.name).toContain("(fictional)");
  });
});

describe("Business Dex revenue and sources", () => {
  for (const b of businesses) {
    const sourceIds = new Set(b.sources.map((s) => s.id));
    it(`${b.name}: revenue label is valid and backed by a source`, () => {
      const r = b.revenue;
      if (r.status === "unknown") {
        expect(Object.keys(r)).toEqual(["status"]);
        return;
      }
      expect(sourceIds.has(r.sourceId)).toBe(true);
      if (r.status === "estimated") expect(r.highUsd).toBeGreaterThan(r.lowUsd);
      else expect(r.annualUsd).toBeGreaterThan(0);
    });
    it(`${b.name}: sources are synthetic and signals cite them`, () => {
      for (const s of b.sources) expect(s.url.startsWith("synthetic://"), s.url).toBe(true);
      for (const s of b.signals) expect(sourceIds.has(s.sourceId), s.id).toBe(true);
    });
    it(`${b.name}: has 12 months of case-study history`, () => {
      const h = getCaseStudyHistory(b.id);
      expect(h).toHaveLength(12);
      expect(h[0]?.revenueIndex).toBe(100);
    });
  }
});

describe("links between records point to real records", () => {
  it("follow-ups and conversations -> prospects", () => {
    for (const f of mc.followUps) expect(prospectIds.has(f.prospectId), f.id).toBe(true);
    for (const c of conversations) expect(prospectIds.has(c.prospectId), c.id).toBe(true);
  });

  it("prospects, trends and survey answers -> Business Dex", () => {
    for (const p of prospects) if (p.businessId) expect(businessIds.has(p.businessId), p.id).toBe(true);
    for (const t of trends) for (const id of t.businessIds) expect(businessIds.has(id), t.id).toBe(true);
    const qIds = new Set(questions.map((q) => q.id));
    for (const a of answers) {
      expect(businessIds.has(a.businessId), a.id).toBe(true);
      expect(qIds.has(a.questionId), a.id).toBe(true);
    }
  });

  it("insight evidence -> businesses or trends", () => {
    for (const i of insights) {
      for (const e of i.evidence) {
        const pool = e.recordType === "trend" ? trendIds : businessIds;
        expect(pool.has(e.recordId), `${i.id} -> ${e.recordId}`).toBe(true);
      }
    }
  });

  it("alert and activity links stay inside the app", () => {
    for (const x of [...mc.alerts, ...mc.activity]) if (x.href) expect(x.href.startsWith("/"), x.id).toBe(true);
  });

  it("GoHighLevel has zero write targets", () => {
    expect(getSafetyStatus().ghlWriteTargets).toEqual([]);
  });
});

describe("follow-ups and grades", () => {
  it("red follow-ups are overdue; others are not", () => {
    for (const f of mc.followUps) {
      if (f.urgency === "red") expect(f.due < mc.today, f.id).toBe(true);
      else expect(f.due >= mc.today, f.id).toBe(true);
    }
  });

  it("grade scores match their letters and always show reasons", () => {
    const ranges = { A: [80, 100], B: [60, 79], C: [40, 59], D: [0, 39] } as const;
    for (const p of prospects) {
      const [lo, hi] = ranges[p.grade.letter];
      expect(p.grade.score, p.id).toBeGreaterThanOrEqual(lo);
      expect(p.grade.score, p.id).toBeLessThanOrEqual(hi);
      expect(p.grade.factors.length, p.id).toBeGreaterThan(0);
    }
  });

  it("prospects to work exclude won and lost", () => {
    for (const p of getProspectsToWork().all) expect(["won", "lost"]).not.toContain(p.stage);
  });

  it("survey bank asks for consent", () => {
    expect(questions.some((q) => /anonymized/i.test(q.question))).toBe(true);
  });
});

describe("client roster", () => {
  it("summary adds up", () => {
    const s = getRosterSummary();
    const active = getRoster().filter((c) => c.status === "active");
    expect(s.activeCount).toBe(active.length);
    expect(s.activeMrr).toBeCloseTo(active.reduce((n, c) => n + c.monthlyUsd, 0), 2);
    expect(s.tiers.high.count + s.tiers.mid.count + s.tiers.low.count).toBe(active.length);
    expect(s.tiers.high.mrr + s.tiers.mid.mrr + s.tiers.low.mrr).toBeCloseTo(s.activeMrr, 2);
  });

  it("each person appears once, with a unique page address", () => {
    const roster = getRoster();
    expect(new Set(roster.map((c) => c.name.toLowerCase())).size).toBe(roster.length);
    expect(new Set(roster.map((c) => c.id)).size).toBe(roster.length);
  });

  it("tiers use your cut-offs", () => {
    expect(tierOf(500)).toBe("high");
    expect(tierOf(499)).toBe("mid");
    expect(tierOf(150)).toBe("mid");
    expect(tierOf(149.99)).toBe("low");
  });

  it("counts months with you correctly", () => {
    expect(monthsBetween("2025-11-24", "2026-11-02")).toBe(11);
    expect(monthsBetween("2026-10-27", "2026-11-02")).toBe(0);
    expect(describeTenure("2026-10-27", "2026-11-02")).toBe("under 1 month");
    expect(describeTenure("2026-07-20", "2026-11-02")).toBe("3 months");
  });
});

describe("private client-file checker", () => {
  it("returns nothing for a missing or malformed file", () => {
    expect(parseRoster(null)).toBeNull();
    expect(parseRoster({})).toBeNull();
    expect(parseRoster({ clients: "nope" })).toBeNull();
  });

  it("skips bad records instead of showing them", () => {
    const result = parseRoster({
      clients: [
        { name: "Good Client", monthlyUsd: 100, startDate: "2026-01-05", status: "active" },
        { name: "", monthlyUsd: 100, startDate: "2026-01-05", status: "active" },
        { name: "Negative", monthlyUsd: -5, startDate: "2026-01-05", status: "active" },
        { name: "Bad date", monthlyUsd: 5, startDate: "Jan 5", status: "active" },
        { name: "Bad status", monthlyUsd: 5, startDate: "2026-01-05", status: "vip" },
        { name: "x".repeat(200), monthlyUsd: 5, startDate: "2026-01-05", status: "active" },
        { name: "Text amount", monthlyUsd: "100", startDate: "2026-01-05", status: "active" },
      ],
    });
    expect(result?.clients.map((c) => c.name)).toEqual(["Good Client"]);
    expect(result?.skipped).toBe(6);
  });

  it("strips hidden control characters and keeps text as plain text", () => {
    const result = parseRoster({
      clients: [{ name: "Ann\u0000\u0007 Lee", monthlyUsd: 50, startDate: "2026-02-01", status: "paused", check: "<script>alert(1)</script>" }],
    });
    expect(result?.clients[0]?.name).toBe("Ann Lee");
    // Kept as text; React shows it literally and never runs it.
    expect(result?.clients[0]?.check).toBe("<script>alert(1)</script>");
  });

  it("gives duplicate-looking names different page addresses", () => {
    const result = parseRoster({
      clients: [
        { name: "Sam Lee", monthlyUsd: 50, startDate: "2026-02-01", status: "active" },
        { name: "Sam  Lee!", monthlyUsd: 60, startDate: "2026-03-01", status: "active" },
      ],
    });
    expect(result?.clients.map((c) => c.id)).toEqual(["sam-lee", "sam-lee-2"]);
  });

  it("the demo roster passes every check", () => {
    expect(parseRoster(demoRosterRaw)?.skipped).toBe(0);
  });
});

describe("untrusted message text", () => {
  it("is plain data: a message 'instruction' changes nothing", () => {
    const injected = conversations.find((c) => /ignore your previous instructions/i.test(c.preview));
    expect(injected).toBeDefined();
    const p = prospects.find((x) => x.id === injected!.prospectId)!;
    expect(p.stage).not.toBe("won");
    // It must not have created a client either.
    expect(getRoster().some((c) => c.name.toLowerCase().includes("velvet fork"))).toBe(false);
  });
});
