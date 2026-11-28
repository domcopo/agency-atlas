// Semrush whole-site summaries (Phase B, approved 2026-11-28): how Semrush's CSV answers are
// read (untrusted), and that nothing is sent for a bad website. Synthetic data only.

import { describe, expect, it } from "vitest";
import { domainRank, isSemrushConfigured, readDomainRank, SEMRUSH_RULES, SemrushError } from "@/lib/audit/sources/semrush";

describe("Semrush answers", () => {
  it("reads keywords, visits and value from the CSV row", () => {
    const csv = "Domain;Rank;Organic Keywords;Organic Traffic;Organic Cost\r\nroof.example.com;4808809;84;60;1262\r\n";
    expect(readDomainRank("roof.example.com", csv)).toEqual({ domain: "roof.example.com", keywords: 84, visits: 60, valueUsd: 1262 });
  });

  it("'nothing found' is no data, not a failure; odd values are null, never guessed", () => {
    expect(readDomainRank("new.example.com", "ERROR 50 :: NOTHING FOUND")).toEqual({ domain: "new.example.com", keywords: null, visits: null, valueUsd: null });
    expect(readDomainRank("x.example.com", "Domain;Rank;Organic Keywords;Organic Traffic;Organic Cost\nx.example.com;1;12.5;-3;abc")).toEqual({ domain: "x.example.com", keywords: null, visits: null, valueUsd: null });
    expect(readDomainRank("x.example.com", "")).toEqual({ domain: "x.example.com", keywords: null, visits: null, valueUsd: null });
  });

  it("a refused key or an empty unit balance is a plain error", () => {
    expect(() => readDomainRank("x.example.com", "ERROR 120 :: WRONG KEY - ID PAIR")).toThrow(/refused the key/);
    expect(() => readDomainRank("x.example.com", "ERROR 132 :: API UNITS BALANCE IS ZERO")).toThrow(/no API units left/);
    expect(() => readDomainRank("x.example.com", "ERROR 999 :: SOMETHING")).toThrow(SemrushError);
  });
});

describe("Semrush module refuses before sending anything", () => {
  it("bad websites are blocked; without a key nothing is sent", async () => {
    await expect(domainRank("../projects")).rejects.toThrow(/Blocked/);
    await expect(domainRank("not a site")).rejects.toThrow(/Blocked/);
    if (!isSemrushConfigured()) await expect(domainRank("roof.example.com")).rejects.toThrow(/isn't connected/);
  });

  it("the cap allows a full audit (business + 5 competitors) and no more than 20 sites", () => {
    const sites = SEMRUSH_RULES.maxUnitsPerRun / SEMRUSH_RULES.unitsPerSite;
    expect(sites).toBeGreaterThanOrEqual(6);
    expect(sites).toBeLessThanOrEqual(20);
  });
});
