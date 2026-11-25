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
