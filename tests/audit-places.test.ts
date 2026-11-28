// Place names for audits (src/lib/audit/places.ts): one place per entry, counties kept,
// trailing state dropped. Pure. Place names are real public town names; no business data.

import { areaShare, farTownInDomain } from "@/lib/audit/places-list";
import { describe, expect, it } from "vitest";
import { parseIntake } from "@/lib/audit/intake";
import { cleanPlaces, splitPlace } from "@/lib/audit/places";

describe("cleaning typed places", () => {
  it("splits combined entries", () => {
    expect(splitPlace("Westminster & Thornton", "CO")).toEqual(["Westminster", "Thornton"]);
    expect(splitPlace("Arvada / Golden", "CO")).toEqual(["Arvada", "Golden"]);
    expect(splitPlace("Warren and Niles", "OH")).toEqual(["Warren", "Niles"]);
  });

  it("keeps counties as counties", () => {
    expect(splitPlace("Trumbull and Columbiana County", "OH")).toEqual(["Trumbull County", "Columbiana County"]);
    expect(splitPlace("trumbull and columbiana counties", "OH")).toEqual(["Trumbull County", "Columbiana County"]);
    expect(splitPlace("Mahoning County", "OH")).toEqual(["Mahoning County"]);
  });

  it("drops a trailing state and fixes all-lowercase typing", () => {
    expect(splitPlace("Warren, OH", "OH")).toEqual(["Warren"]);
    expect(splitPlace("canfield ohio", "OH")).toEqual(["Canfield"]);
    expect(splitPlace("McDonald", "OH")).toEqual(["McDonald"]);
    expect(splitPlace("mcdonald", "OH")).toEqual(["McDonald"]);
  });

  it("doesn't split names that merely contain 'and'", () => {
    expect(splitPlace("Andover", "OH")).toEqual(["Andover"]);
    expect(splitPlace("Highland Heights", "OH")).toEqual(["Highland Heights"]);
  });

  it("removes duplicates across entries", () => {
    expect(cleanPlaces(["Warren", "warren, oh", "Niles & Warren"], "OH")).toEqual(["Warren", "Niles"]);
  });

  it("the audit intake uses it for the home town and cities", () => {
    const r = parseIntake({ company: "Sample Roofing (fictional)", domain: "sampleroofing.example", niche: "Roofing", hqTown: "Austintown, OH", state: "OH", cities: "Boardman, Trumbull and Columbiana County\nWarren & Niles", avgJobUsd: 9000 });
    expect(r.ok && [r.intake.hqTown, r.intake.cities]).toEqual(["Austintown", ["Boardman", "Trumbull County", "Columbiana County", "Warren", "Niles"]]);
  });
});

describe("checking names against Google's place list", () => {
  it("knows real towns, townships and counties, in Google's spelling", async () => {
    const { placeBookFor } = await import("@/lib/audit/places-list");
    const oh = placeBookFor("OH")!;
    expect(oh.canonical("austintown")).toBe("Austintown");
    expect(oh.canonical("Mahoning County")).toBe("Mahoning County");
    expect(oh.canonical("Trumbull")).toBeNull();
    expect(oh.suggest("Trumbull")).toContain("Trumbull County");
    const co = placeBookFor("CO")!;
    expect(co.canonical("Westminster")).toBe("Westminster");
    expect(co.suggest("Denverr")).toContain("Denver");
    expect(placeBookFor("XX")).toBeNull();
  });

  it("saving refuses a place Google doesn't know and suggests the fix; reading old audits doesn't check", async () => {
    const { placeBookFor } = await import("@/lib/audit/places-list");
    const form = { company: "Sample Homes (fictional)", domain: "samplehomes.example", niche: "Home buyers", hqTown: "Denverr", state: "CO", cities: "Westminster & Thornton", avgJobUsd: 10000 };
    const saving = parseIntake(form, { places: placeBookFor });
    expect(saving.ok).toBe(false);
    expect(!saving.ok && saving.errors[0]).toMatch(/^Home town: "Denverr" isn't a place Google knows in Colorado\. Did you mean Denver/);
    expect(parseIntake(form).ok).toBe(true); // reading a saved audit: no place check
    const fixed = parseIntake({ ...form, hqTown: "denver, co" }, { places: placeBookFor });
    expect(fixed.ok && [fixed.intake.hqTown, fixed.intake.cities]).toEqual(["Denver", ["Westminster", "Thornton"]]);
  });

  it("the full list stays on the server (builders get one state at a time)", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["src/components/audit/AuditBuilder.tsx", "src/components/audit/ads/AdsBuilder.tsx", "src/components/audit/PlaceHelpers.tsx", "src/lib/audit/places.ts", "src/lib/audit/intake.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/from "[^"]*(us-places|places-list)/);
    }
  });
});

describe("towns in other states and distances", () => {
  it("keeps 'Sharon, PA' together and labels other-state towns", async () => {
    const { cleanPlaces, placeState } = await import("@/lib/audit/places");
    expect(cleanPlaces(["Boardman", "Sharon", "PA", "hermitage, pennsylvania", "Warren, OH"], "OH")).toEqual(["Boardman", "Sharon, PA", "Hermitage, PA", "Warren"]);
    expect(placeState("Sharon, PA", "OH")).toEqual({ name: "Sharon", state: "PA" });
    expect(placeState("Warren", "OH")).toEqual({ name: "Warren", state: "OH" });
  });

  it("miles between two towns", async () => {
    const { milesBetween } = await import("@/lib/audit/places");
    // Austintown OH → Sharon PA is about 14 miles
    const m = milesBetween([41.092, -80.738], [41.234, -80.5]);
    expect(m).toBeGreaterThan(12);
    expect(m).toBeLessThan(17);
  });
});

describe("nearby towns (30 miles) and the builder's place check", () => {
  it("suggests towns around Austintown, closest first, Pennsylvania included", async () => {
    const { nearbyTowns } = await import("@/lib/audit/places-list");
    const near = nearbyTowns("OH", "Austintown");
    const labels = near.map((n) => n.label);
    expect(labels).toContain("Boardman");
    expect(labels).toContain("Youngstown");
    expect(labels).toContain("Canfield");
    expect(labels.some((l) => l.endsWith(", PA"))).toBe(true);
    expect(near.every((n) => n.miles <= 30)).toBe(true);
    expect(near.map((n) => n.miles)).toEqual([...near.map((n) => n.miles)].sort((a, b) => a - b));
    expect(labels).not.toContain("Mahoning County");
  });

  it("checks each typed town: Google's spelling, miles from home, other-state matches", async () => {
    const { checkPlaces } = await import("@/lib/audit/places-list");
    const r = checkPlaces("OH", "austintown, oh", ["Boardman", "Sharon", "Columbus", "Canfeild"]);
    expect(r.home).toBe("Austintown");
    const by = Object.fromEntries(r.checks.map((c) => [c.typed, c]));
    expect(by.Boardman?.label).toBe("Boardman");
    expect(by.Boardman?.miles).toBeLessThan(10);
    expect(by.Columbus?.miles).toBeGreaterThan(100); // far away: the builder asks "keep it?"
    expect(by.Canfeild?.suggest).toContain("Canfield");
    // No Sharon in Ohio's Google list: Sharon, PA (14 miles away) is offered first
    expect(by.Sharon?.label).toBeNull();
    expect(by.Sharon?.suggest[0]).toBe("Sharon, PA");
  });

  it("saving accepts 'Sharon, PA' and checks it against Pennsylvania", async () => {
    const { placeBookFor } = await import("@/lib/audit/places-list");
    const r = parseIntake({ company: "Sample Roofing (fictional)", domain: "sampleroofing.example", niche: "Roofing", hqTown: "Austintown", state: "OH", cities: "Boardman, Sharon, PA, Hermitage, Pennsylvania", avgJobUsd: 9000 }, { places: placeBookFor });
    expect(r.ok && r.intake.cities).toEqual(["Boardman", "Sharon, PA", "Hermitage, PA"]);
    const bad = parseIntake({ company: "Sample Roofing (fictional)", domain: "sampleroofing.example", niche: "Roofing", hqTown: "Austintown", state: "OH", cities: "Shaaron, PA", avgJobUsd: 9000 }, { places: placeBookFor });
    expect(!bad.ok && bad.errors[0]).toMatch(/in Pennsylvania\. Did you mean Sharon, PA/);
  });

  it("the run looks other-state towns up in their own state and searches the plain name", async () => {
    const { moneyKeywords } = await import("@/lib/audit/run");
    expect(moneyKeywords(["Roofing"], ["Austintown", "Sharon, PA"], "OH").map((k) => k.keyword)).toEqual(["roofing austintown", "roofing sharon", "roofing near me"]);
  });
});

describe("far-away towns in web addresses (competitor filter)", () => {
  // Real public place names; the web addresses are made up.
  it("names a town beyond the audit's radius, and nothing for local or plain addresses", () => {
    expect(farTownInDomain("homebuyersmetairie.example", "OH", "Youngstown", 45)).toBe("metairie");
    expect(farTownInDomain("columbus.webuyhouses.example", "OH", "Youngstown", 45)).toBe("columbus");
    expect(farTownInDomain("homebuyermilwaukee.example", "OH", "Youngstown", 45)).toBe("milwaukee");
    for (const d of ["youngstownhomebuyer.example", "boardmancashoffers.example", "sellmyhousefast.example", "webuyhouses.cash", "hometownfixerupper.example", "steelvalleyhomes.example", "kellywarrenrealty.example", "dealrun.ai"])
      expect(farTownInDomain(d, "OH", "Youngstown", 45), d).toBeNull();
    // Business names work too (a name keeps its whole text).
    expect(farTownInDomain("We Buy Houses Kansas City", "OH", "Youngstown", 45)).toBe("kansascity");
    expect(farTownInDomain("Steel Valley Homes, LLC", "OH", "Youngstown", 45)).toBeNull();
    expect(farTownInDomain("GCH Home Buyers", "OH", "Youngstown", 45)).toBeNull();
    // Same address, audit near that town: local.
    expect(farTownInDomain("columbus.webuyhouses.example", "OH", "Westerville", 45)).toBeNull();
    // Unknown home town: never guessed.
    expect(farTownInDomain("homebuyersmetairie.example", "OH", "Nowhere Fictional", 45)).toBeNull();
  });
});

describe("area population share (US Census 2024 county estimates)", () => {
  it("adds up the counties within the radius and divides by the US total", () => {
    const a = areaShare("OH", "Youngstown", 45);
    expect(a).not.toBeNull();
    expect(a!.counties).toBeGreaterThanOrEqual(3); // at least Mahoning, Trumbull, Columbiana counties
    expect(a!.population).toBeGreaterThan(500_000);
    expect(a!.population).toBeLessThan(5_000_000);
    expect(a!.share).toBeCloseTo(a!.population / 340_110_988, 5);
    expect(a!.miles).toBe(45);
    // A smaller radius never counts more people.
    expect(areaShare("OH", "Youngstown", 20)!.population).toBeLessThanOrEqual(a!.population);
  });

  it("a tiny radius still counts the nearest county; an unknown town gives nothing", () => {
    expect(areaShare("OH", "Youngstown", 1)!.counties).toBe(1);
    expect(areaShare("OH", "Nowhere Fictional", 45)).toBeNull();
  });
});
