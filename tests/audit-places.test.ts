// Place names for audits (src/lib/audit/places.ts): one place per entry, counties kept,
// trailing state dropped. Pure. Place names are real public town names; no business data.

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
