// Checks that the demo data follows our data rules:
// everything is marked fake, revenue is always labeled with a source,
// and contact details can't be mistaken for real people.

import { describe, expect, it } from "vitest";
import {
  getBusinesses,
  getClients,
  getInsights,
  getMissionControl,
  getSafetyStatus,
  DATA_MODE,
} from "@/lib/data-source";

const businesses = getBusinesses();
const clients = getClients();
const insights = getInsights();
const mc = getMissionControl();

describe("synthetic data markers", () => {
  it("runs in mock mode", () => {
    expect(DATA_MODE).toBe("mock");
    expect(getSafetyStatus().dataMode).toBe("mock");
  });

  it("marks every record as synthetic", () => {
    const records = [...businesses, ...clients, ...insights, ...mc.alerts, ...mc.followUps, ...mc.activity];
    for (const r of records) expect(r.isSynthetic, r.id).toBe(true);
  });

  it("has the sprint's target sizes: 10 businesses, 3 clients", () => {
    expect(businesses).toHaveLength(10);
    expect(clients).toHaveLength(3);
  });

  it("uses unique ids", () => {
    const ids = [
      ...businesses.map((b) => b.id),
      ...clients.map((c) => c.id),
      ...insights.map((i) => i.id),
      ...mc.alerts.map((a) => a.id),
      ...mc.followUps.map((f) => f.id),
      ...mc.activity.map((a) => a.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("revenue and sources", () => {
  for (const b of businesses) {
    const sourceIds = new Set(b.sources.map((s) => s.id));

    it(`${b.name}: revenue label is valid and backed by a source`, () => {
      const r = b.revenue;
      if (r.status === "unknown") {
        expect(Object.keys(r)).toEqual(["status"]); // no number sneaks in
        return;
      }
      expect(sourceIds.has(r.sourceId)).toBe(true);
      expect(r.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (r.status === "estimated") {
        expect(r.lowUsd).toBeGreaterThan(0);
        expect(r.highUsd).toBeGreaterThan(r.lowUsd);
      } else {
        expect(r.annualUsd).toBeGreaterThan(0);
      }
      if (r.status === "client_reported") expect(b.isClient).toBe(true);
    });

    it(`${b.name}: every signal points to a listed source`, () => {
      for (const s of b.signals) expect(sourceIds.has(s.sourceId), s.id).toBe(true);
    });

    it(`${b.name}: sources are synthetic, never real URLs`, () => {
      for (const s of b.sources) expect(s.url.startsWith("synthetic://"), s.url).toBe(true);
    });
  }
});

describe("clients", () => {
  for (const c of clients) {
    it(`${c.name}: links to a matching client record in the Dex`, () => {
      const b = businesses.find((x) => x.id === c.businessId);
      expect(b?.isClient).toBe(true);
      expect(b?.clientId).toBe(c.id);
    });

    it(`${c.name}: contact details are clearly fictional`, () => {
      expect(c.primaryContact.email).toMatch(/@example\.com$/);
      expect(c.primaryContact.phone).toMatch(/^555-01\d\d$/);
      expect(c.primaryContact.name).toContain("(fictional)");
    });

    it(`${c.name}: health score is 0–100`, () => {
      expect(c.health.score).toBeGreaterThanOrEqual(0);
      expect(c.health.score).toBeLessThanOrEqual(100);
    });
  }

  it("non-client businesses never carry a clientId", () => {
    for (const b of businesses.filter((x) => !x.isClient)) expect(b.clientId).toBeUndefined();
  });
});

describe("references between records", () => {
  const clientIds = new Set(clients.map((c) => c.id));
  const businessIds = new Set(businesses.map((b) => b.id));

  it("insight evidence points to real records", () => {
    for (const i of insights) {
      for (const e of i.evidence) {
        const pool = e.recordType === "client" ? clientIds : businessIds;
        expect(pool.has(e.recordId), `${i.id} -> ${e.recordId}`).toBe(true);
      }
    }
  });

  it("mission control items point to real clients", () => {
    for (const x of [...mc.alerts, ...mc.followUps, ...mc.activity]) {
      if (x.clientId) expect(clientIds.has(x.clientId), x.id).toBe(true);
    }
  });

  it("GoHighLevel has zero write targets", () => {
    expect(getSafetyStatus().ghlWriteTargets).toEqual([]);
  });
});
