// Sales rules (src/lib/sales.ts) and the GoHighLevel parsing they rely on. Synthetic data only.

import { describe, expect, it } from "vitest";
import { parseOpportunities, parseUsers } from "@/lib/ghl/client";
import {
  checkTouchNote,
  isWeekday,
  lastTouchByLead,
  leadDetail,
  nyDay,
  personRows,
  pipelineHealth,
  refreshAllowed,
  refreshDue,
  splitLeadFollowUps,
  targetProgress,
  todaysPlan,
  touchesOn,
  type LeadTouch,
  type SalesLead,
  type SalesPipeline,
} from "@/lib/sales";

const TODAY = "2026-11-18"; // a Wednesday
const at = (day: string, hour = 15) => `${day}T${String(hour).padStart(2, "0")}:00:00Z`; // 10:00 New York

function lead(id: string, over: Partial<SalesLead> = {}): SalesLead {
  return {
    ghlId: id,
    name: `Sample Lead ${id} (fictional)`,
    pipelineId: "pipeSales",
    pipelineName: "Sales (sample)",
    stage: "New lead",
    status: "open",
    value: 500,
    source: "synthetic://web",
    createdAt: at("2026-11-01"),
    updatedAt: at("2026-11-01"),
    statusChangedAt: null,
    assignedUserId: null,
    ...over,
  };
}
const pipelines: SalesPipeline[] = [{ id: "pipeSales", name: "Sales (sample)", hotStages: ["Proposal sent"], active: true }];

describe("days and targets", () => {
  it("uses New York days", () => {
    expect(nyDay("2026-11-18T03:00:00Z")).toBe("2026-11-17"); // 10 pm the evening before
    expect(nyDay(at(TODAY))).toBe(TODAY);
  });
  it("weekends have no target", () => {
    expect(isWeekday(TODAY)).toBe(true);
    expect(isWeekday("2026-11-21")).toBe(false);
    expect(targetProgress(3, 15, "2026-11-21")).toEqual({ done: 3, target: 0, weekday: false, met: true });
    expect(targetProgress(7, 15, TODAY)).toEqual({ done: 7, target: 15, weekday: true, met: false });
  });
  it("counts only my reach-outs today", () => {
    const touches: LeadTouch[] = [
      { leadId: "a", kind: "call", at: at(TODAY), by: "me" },
      { leadId: "b", kind: "text", at: at(TODAY), by: "other" },
      { leadId: "c", kind: "call", at: at("2026-11-17"), by: "me" },
    ];
    expect(touchesOn(touches, "me", TODAY)).toBe(1);
    expect(lastTouchByLead([...touches, { leadId: "a", kind: "email", at: at(TODAY, 20), by: "me" }]).get("a")?.kind).toBe("email");
  });
});

describe("reach-out notes", () => {
  it("refuses phone numbers and emails, keeps short notes", () => {
    expect(checkTouchNote("  left a voicemail ").note).toBe("left a voicemail");
    expect(checkTouchNote("").note).toBeNull();
    expect(checkTouchNote("call 555-010-1234 tomorrow").error).toBeTruthy();
    expect(checkTouchNote("wrote to owner@example.com").error).toBeTruthy();
    expect(checkTouchNote("x".repeat(201)).error).toBeTruthy();
  });
});

describe("Today's plan", () => {
  it("orders follow-ups due, then new uncontacted, then quiet; hot first; each lead once, with a reason", () => {
    const leads = [
      lead("newA", { createdAt: at("2026-11-16") }),
      lead("newHot", { createdAt: at("2026-11-10"), stage: "Proposal sent" }),
      lead("quiet", { createdAt: at("2026-10-01"), updatedAt: at("2026-10-20") }),
      lead("due", { createdAt: at("2026-10-01"), updatedAt: at(TODAY) }),
      lead("fresh", { createdAt: at("2026-10-01"), updatedAt: at(TODAY) }),
      lead("won", { status: "won", createdAt: at("2026-11-17") }),
    ];
    const plan = todaysPlan({
      leads,
      touches: [{ leadId: "fresh", kind: "call", at: at("2026-11-17"), by: "me" }],
      followUps: [{ id: "f1", leadId: "due", title: "Send the proposal", dueOn: "2026-11-16", status: "open", ownerStaffId: null }],
      pipelines,
      today: TODAY,
    });
    expect(plan.map((p) => p.lead.ghlId)).toEqual(["due", "newHot", "newA", "quiet"]);
    expect(plan.map((p) => p.group)).toEqual(["follow_up", "new", "new", "stuck"]);
    expect(plan[0]!.why).toMatch(/late/);
    expect(plan[2]!.why).toBe("new 2 days ago, no contact yet");
    expect(plan[3]!.why).toMatch(/nothing for 29 days, no reach-out logged/);
    expect(plan.find((p) => p.lead.ghlId === "won")).toBeUndefined(); // closed leads never appear
  });

  it("'mine' keeps my leads and unassigned ones, plus follow-ups I own", () => {
    const leads = [lead("m", { assignedUserId: "ghlme01", createdAt: at(TODAY) }), lead("o", { assignedUserId: "ghlother", createdAt: at(TODAY) }), lead("u", { createdAt: at(TODAY) }), lead("of", { assignedUserId: "ghlother" })];
    const plan = todaysPlan({
      leads,
      touches: [],
      followUps: [{ id: "f", leadId: "of", title: "Call back", dueOn: TODAY, status: "open", ownerStaffId: "staffMe" }],
      pipelines,
      today: TODAY,
      mine: "ghlme01",
      myStaffId: "staffMe",
    });
    expect(plan.map((p) => p.lead.ghlId).sort()).toEqual(["m", "of", "u"]);
  });

  it("is capped", () => {
    const many = Array.from({ length: 40 }, (_, i) => lead(`n${i}`, { createdAt: at(TODAY) }));
    expect(todaysPlan({ leads: many, touches: [], followUps: [], pipelines, today: TODAY })).toHaveLength(12);
  });
});

describe("pipeline health and people", () => {
  it("counts open, new, not contacted, quiet, reach-outs and this month's won/lost per sales pipeline", () => {
    const leads = [
      lead("a", { createdAt: at("2026-11-16"), updatedAt: at("2026-11-16") }),
      lead("b", { createdAt: at("2026-10-01"), updatedAt: at("2026-10-02") }),
      lead("w", { status: "won", statusChangedAt: at("2026-11-05") }),
      lead("l", { status: "lost", statusChangedAt: at("2026-10-05") }),
      lead("x", { pipelineId: "pipeOther" }),
    ];
    const touches: LeadTouch[] = [{ leadId: "a", kind: "call", at: at(TODAY), by: "me" }];
    const [row] = pipelineHealth({ pipelines: [...pipelines, { id: "off", name: "Off", hotStages: [], active: false }], leads, touches, today: TODAY });
    expect(row).toMatchObject({ open: 2, newThisWeek: 1, notContacted: 1, stuck: 1, touchesToday: 1, touchesWeek: 1, wonMonth: 1, lostMonth: 0 });
  });

  it("per person: today vs target, leads owned (null when not linked), overdue follow-ups", () => {
    const rows = personRows({
      people: [
        { userId: "u1", name: "Sample Seller (fictional)", ghlUserId: "ghlme01", staffId: "s1", target: 10 },
        { userId: "u2", name: "Sample Seller Two (fictional)", ghlUserId: null, staffId: null, target: 15 },
      ],
      leads: [lead("a", { assignedUserId: "ghlme01" }), lead("b", { assignedUserId: "ghlme01", status: "won" })],
      touches: [{ leadId: "a", kind: "call", at: at(TODAY), by: "u1" }],
      followUps: [{ id: "f", leadId: "a", title: "x", dueOn: "2026-11-10", status: "open", ownerStaffId: "s1" }],
      today: TODAY,
    });
    expect(rows[0]).toMatchObject({ touchesToday: 1, target: 10, leadsOwned: 1, overdueFollowUps: 1 });
    expect(rows[1]).toMatchObject({ touchesToday: 0, leadsOwned: null, overdueFollowUps: 0 });
  });
});

describe("lead page and one follow-up list", () => {
  it("leadDetail: the lead, its open follow-ups soonest first, reach-outs newest first; unknown id gives null", () => {
    const d = leadDetail({
      id: "a",
      leads: [lead("a"), lead("b")],
      followUps: [
        { id: "late", leadId: "a", title: "x", dueOn: "2026-11-20", status: "open", ownerStaffId: null },
        { id: "soon", leadId: "a", title: "x", dueOn: "2026-11-10", status: "open", ownerStaffId: null },
        { id: "nodate", leadId: "a", title: "x", dueOn: null, status: "open", ownerStaffId: null },
        { id: "done", leadId: "a", title: "x", dueOn: "2026-11-01", status: "done", ownerStaffId: null },
        { id: "gone", leadId: "a", title: "x", dueOn: "2026-11-01", status: "canceled", ownerStaffId: null },
        { id: "otherLead", leadId: "b", title: "x", dueOn: "2026-11-01", status: "open", ownerStaffId: null },
      ],
      touches: [
        { leadId: "a", kind: "call", at: at("2026-11-10"), by: "me" },
        { leadId: "a", kind: "text", at: at(TODAY), by: "me" },
        { leadId: "b", kind: "call", at: at(TODAY), by: "me" },
      ],
    });
    expect(d?.lead.ghlId).toBe("a");
    expect(d?.followUps.map((f) => f.id)).toEqual(["soon", "late", "nodate"]);
    expect(d?.touches.map((t) => t.kind)).toEqual(["text", "call"]);
    // A lead the database didn't return (another pipeline, closed for a salesperson) is "not found".
    expect(leadDetail({ id: "zzz", leads: [lead("a")], followUps: [], touches: [] })).toBeNull();
  });

  it("splitLeadFollowUps: sales-pipeline leads vs other pipelines; nothing with a lead is lost; non-lead items left out", () => {
    const items = [{ id: 1, lead: "a" }, { id: 2, lead: "x" }, { id: 3, lead: null }, { id: 4, lead: "b" }];
    const { sales, other } = splitLeadFollowUps(items, (i) => i.lead, new Set(["a", "b"]));
    expect(sales.map((i) => i.id)).toEqual([1, 4]);
    expect(other.map((i) => i.id)).toEqual([2]);
    expect(sales.length + other.length).toBe(items.filter((i) => i.lead).length);
  });
});

describe("refreshing", () => {
  const now = new Date("2026-11-18T15:00:00Z");
  it("auto-refreshes when the copy is an hour old or missing; allows one refresh per 10 minutes", () => {
    expect(refreshDue(null, now)).toBe(true);
    expect(refreshDue("2026-11-18T14:30:00Z", now)).toBe(false);
    expect(refreshDue("2026-11-18T13:59:00Z", now)).toBe(true);
    expect(refreshAllowed("2026-11-18T14:55:00Z", now)).toBe(false);
    expect(refreshAllowed("2026-11-18T14:49:00Z", now)).toBe(true);
  });
});

describe("GoHighLevel parsing for Sales", () => {
  it("keeps only the id and a name for users; drops names that look like contact details", () => {
    const users = parseUsers([
      { id: "ghlUser001", name: "Sample Seller (fictional)", email: "seller@example.com", phone: "555-010-1111", roles: { type: "account" } },
      { id: "ghlUser002", firstName: "Sample", lastName: "Two" },
      { id: "ghlUser003", name: "seller@example.com" },
      { id: "bad id!", name: "X" },
    ]);
    expect(users).toEqual([
      { ghlUserId: "ghlUser001", name: "Sample Seller (fictional)" },
      { ghlUserId: "ghlUser002", name: "Sample Two" },
    ]);
    expect(JSON.stringify(users)).not.toMatch(/example\.com|555/);
  });

  it("copies the pipeline id and the assigned user id of each opportunity", () => {
    const pipes = new Map([["pipeSales", { name: "Sales (sample)", stages: new Map([["st1", "New lead"]]) }]]);
    const [o] = parseOpportunities([{ id: "opp123", status: "open", pipelineId: "pipeSales", pipelineStageId: "st1", assignedTo: "ghlUser001", name: "Sample Co (fictional)" }], pipes);
    expect(o).toMatchObject({ pipelineId: "pipeSales", pipelineName: "Sales (sample)", stageName: "New lead", assignedUserId: "ghlUser001" });
    const [bad] = parseOpportunities([{ id: "opp124", status: "open", assignedTo: "not valid!" }], pipes);
    expect(bad).toMatchObject({ pipelineId: null, assignedUserId: null });
  });
});
