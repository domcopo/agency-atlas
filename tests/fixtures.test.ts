// Checks that the demo data follows our data rules:
// everything is marked fake, money is always labeled with its basis,
// people and places can't be mistaken for real ones, and every link between
// records points somewhere real.

import { describe, expect, it } from "vitest";
import {
  DATA_MODE,
  getBuyers,
  getConversations,
  getDeals,
  getInsights,
  getLeads,
  getLeadsToWork,
  getMissionControl,
  getSafetyStatus,
  getTeam,
} from "@/lib/data-source";
import { describeDue, formatMoney } from "@/lib/format";
import type { Money } from "@/lib/types";

const leads = getLeads();
const deals = getDeals();
const buyers = getBuyers();
const conversations = getConversations();
const insights = getInsights();
const team = getTeam();
const mc = getMissionControl();

const leadIds = new Set(leads.map((l) => l.id));
const dealIds = new Set(deals.map((d) => d.id));
const buyerIds = new Set(buyers.map((b) => b.id));

function checkMoney(m: Money, where: string) {
  if (m.status === "unknown") {
    expect(Object.keys(m), where).toEqual(["status"]); // no number sneaks in
    return;
  }
  expect(m.basis.length, `${where}: basis`).toBeGreaterThan(3);
  expect(m.basis, `${where}: basis marked fake`).toMatch(/\(fake\)/);
  if (m.status === "estimated") {
    expect(m.lowUsd, where).toBeGreaterThan(0);
    expect(m.highUsd, where).toBeGreaterThan(m.lowUsd);
  } else {
    expect(m.amountUsd, where).toBeGreaterThan(0);
  }
}

describe("synthetic data markers", () => {
  it("runs in mock mode", () => {
    expect(DATA_MODE).toBe("mock");
    expect(getSafetyStatus().dataMode).toBe("mock");
  });

  it("marks every record as synthetic", () => {
    const records = [
      ...leads,
      ...deals,
      ...buyers,
      ...conversations,
      ...insights,
      ...team,
      ...mc.alerts,
      ...mc.followUps,
      ...mc.activity,
    ];
    for (const r of records) expect(r.isSynthetic, r.id).toBe(true);
  });

  it("uses unique ids", () => {
    const ids = [
      ...leads,
      ...deals,
      ...buyers,
      ...conversations,
      ...insights,
      ...team,
      ...mc.alerts,
      ...mc.followUps,
      ...mc.activity,
    ].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("people, companies and cities are clearly fictional", () => {
    for (const l of leads) {
      expect(l.sellerName, l.id).toContain("(fictional)");
      expect(l.property.city, l.id).toContain("(fictional)");
      expect(l.email, l.id).toMatch(/@example\.com$/);
      expect(l.phone, l.id).toMatch(/^555-01\d\d$/);
    }
    for (const b of buyers) {
      expect(b.name, b.id).toContain("(fictional)");
      expect(b.contactName, b.id).toContain("(fictional)");
      expect(b.email, b.id).toMatch(/@([a-z0-9-]+\.)?example\.com$/);
      expect(b.phone, b.id).toMatch(/^555-01\d\d$/);
      for (const a of b.areas) expect(a, b.id).toContain("(fictional)");
    }
    for (const m of team) expect(m.name, m.id).toContain("(fictional)");
  });
});

describe("money is always labeled", () => {
  for (const l of leads) {
    it(`${l.id}: asking price`, () => checkMoney(l.askingPrice, l.id));
  }
  for (const d of deals) {
    it(`${d.id}: contract, ARV, repairs and fee`, () => {
      checkMoney(d.contractPrice, `${d.id} contract`);
      checkMoney(d.arv, `${d.id} arv`);
      checkMoney(d.repairs, `${d.id} repairs`);
      checkMoney(d.assignmentFee, `${d.id} fee`);
    });
  }

  it("an assigned deal's confirmed fee equals the winning offer minus the contract price", () => {
    for (const d of deals.filter((x) => x.stage === "assigned")) {
      const offer = Math.max(...d.buyerInterest.map((b) => b.offer ?? 0));
      if (d.assignmentFee.status === "confirmed" && d.contractPrice.status === "confirmed") {
        expect(d.assignmentFee.amountUsd, d.id).toBe(offer - d.contractPrice.amountUsd);
      }
    }
  });
});

describe("lead grades", () => {
  it("score fits the letter and every grade shows its reasons", () => {
    const ranges = { A: [80, 100], B: [60, 79], C: [40, 59], D: [0, 39] } as const;
    for (const l of leads) {
      const [lo, hi] = ranges[l.grade.letter];
      expect(l.grade.score, l.id).toBeGreaterThanOrEqual(lo);
      expect(l.grade.score, l.id).toBeLessThanOrEqual(hi);
      expect(l.grade.factors.length, l.id).toBeGreaterThan(0);
    }
  });

  it("leads list is sorted best grade first", () => {
    const scores = leads.map((l) => l.grade.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("links between records point to real records", () => {
  it("deals -> leads, and under-contract leads have a deal", () => {
    for (const d of deals) expect(leadIds.has(d.leadId), d.id).toBe(true);
    const dealLeads = new Set(deals.map((d) => d.leadId));
    for (const l of leads.filter((x) => x.stage === "under_contract")) {
      expect(dealLeads.has(l.id), l.id).toBe(true);
    }
  });

  it("buyer interest -> buyers", () => {
    for (const d of deals) for (const bi of d.buyerInterest) expect(buyerIds.has(bi.buyerId), d.id).toBe(true);
  });

  it("leads are assigned to team members", () => {
    const teamIds = new Set(team.map((m) => m.id));
    for (const l of leads) expect(teamIds.has(l.assignedTo), l.id).toBe(true);
  });

  it("conversations, follow-ups, alerts and activity -> leads/deals", () => {
    for (const c of conversations) expect(leadIds.has(c.leadId), c.id).toBe(true);
    for (const f of mc.followUps) expect(leadIds.has(f.leadId), f.id).toBe(true);
    for (const x of [...mc.alerts, ...mc.activity]) {
      if (x.leadId) expect(leadIds.has(x.leadId), x.id).toBe(true);
      if (x.dealId) expect(dealIds.has(x.dealId), x.id).toBe(true);
    }
  });

  it("insight evidence -> leads, deals or buyers", () => {
    const pools = { lead: leadIds, deal: dealIds, buyer: buyerIds };
    for (const i of insights) {
      for (const e of i.evidence) expect(pools[e.recordType].has(e.recordId), `${i.id} -> ${e.recordId}`).toBe(true);
    }
  });

  it("GoHighLevel has zero write targets", () => {
    expect(getSafetyStatus().ghlWriteTargets).toEqual([]);
  });
});

describe("home screen math", () => {
  it("leads to work excludes dead and under-contract leads", () => {
    const { all, overdue } = getLeadsToWork(mc.today);
    for (const l of all) expect(["dead", "under_contract"]).not.toContain(l.stage);
    for (const l of overdue) expect(l.nextFollowUp! < mc.today).toBe(true);
    expect(all.length).toBeGreaterThan(0);
  });

  it("red follow-ups are overdue; others are not", () => {
    for (const f of mc.followUps) {
      if (f.urgency === "red") expect(f.due < mc.today, f.id).toBe(true);
      else expect(f.due >= mc.today, f.id).toBe(true);
    }
  });

  it("ratio KPIs match their parts (14 appointments, 3 contracts)", () => {
    const k = Object.fromEntries(mc.sales.map((s) => [s.id, s.value]));
    expect(k.k_apc).toBeCloseTo((k.k_appts ?? 0) / (k.k_contracts ?? 1), 1);
  });

  it("formats due dates and money in plain words", () => {
    expect(describeDue("2026-11-02", "2026-11-02")).toBe("today");
    expect(describeDue("2026-11-03", "2026-11-02")).toBe("tomorrow");
    expect(describeDue("2026-11-01", "2026-11-02")).toBe("1 day overdue");
    expect(describeDue("2026-10-31", "2026-11-02")).toBe("2 days overdue");
    expect(formatMoney({ status: "unknown" })).toBe("Unknown");
    expect(formatMoney({ status: "estimated", lowUsd: 130_000, highUsd: 150_000, basis: "x" })).toBe("$130K–$150K");
  });
});

describe("untrusted message text", () => {
  it("is plain data: the demo includes an 'instruction' that the app must ignore", () => {
    const injected = conversations.find((c) => /ignore your previous instructions/i.test(c.preview));
    expect(injected).toBeDefined();
    // The lead it mentions is unchanged: still contacted, not sold, no deal.
    const lead = leads.find((l) => l.id === injected!.leadId)!;
    expect(lead.stage).toBe("contacted");
    expect(deals.some((d) => d.leadId === lead.id)).toBe(false);
  });
});
