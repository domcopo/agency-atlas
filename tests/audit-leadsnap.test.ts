// LeadSnap heat maps (approved 2026-11-27): the grid Atlas asks for, how LeadSnap's answers are
// read (untrusted), and that the result passes the same checker as everything else.
// Synthetic data only: fictional places, made-up listing IDs.

import { describe, expect, it } from "vitest";
import { heatmapBlock, heatmapId, heatPendingOf, LEADSNAP_RULES, planGrid, readHeatmap, readLeaders, reusableHeatmap, withHeatmap } from "@/lib/audit/leadsnap";
import { readPlace } from "@/lib/audit/run";
import { createHeatmap, getHeatmap, LeadSnapError } from "@/lib/audit/sources/leadsnap";

const LAT = 41.1;
const LNG = -80.65;

/** A finished LeadSnap heat map for our own grid, ranks given row by row (north→south). */
function answer(ranks: (number | null)[][], extra: Record<string, unknown> = {}) {
  const size = ranks.length;
  const pts = planGrid(LAT, LNG, size, 2);
  return {
    id: 4242,
    business_place_id: "ChIJfictional_place_0001",
    grid_center_lat: String(LAT),
    grid_center_lng: String(LNG),
    grid_size: size,
    grid_point_distance: "2",
    grid_point_distance_row: 2,
    grid_distance_measure: "mi",
    status: "completed",
    status_code: 2,
    // LeadSnap sends coordinates as text and in its own order: shuffled here on purpose.
    points: pts.map((p, i) => ({ id: i, index: i, lat: p.lat.toFixed(10), lng: p.lng.toFixed(10), rank: ranks[Math.floor(i / size)]![i % size] })).reverse(),
    ...extra,
  };
}

describe("LeadSnap grid", () => {
  it("plans 7×7 points 2 miles apart, north→south rows, west→east", () => {
    const g = planGrid(LAT, LNG);
    expect(g).toHaveLength(LEADSNAP_RULES.gridSize ** 2);
    expect(g[24]).toEqual({ lat: LAT, lng: LNG }); // the centre is the business
    expect(g[0]!.lat).toBeGreaterThan(g[48]!.lat);
    expect(g[0]!.lng).toBeLessThan(g[6]!.lng);
    // 2 miles ≈ 0.029° of latitude
    expect(g[17]!.lat - g[24]!.lat).toBeCloseTo(2 / 69, 4);
  });

  it("reads each point back into its own cell, whatever order LeadSnap sends them in", () => {
    const ranks = Array.from({ length: 7 }, (_, r) => Array.from({ length: 7 }, (_, c) => (r === 3 && c === 3 ? 1 : r * 7 + c > 40 ? null : ((r + c) % 20) + 1)));
    const read = readHeatmap(answer(ranks));
    expect(read?.status).toBe("ready");
    expect(read?.size).toBe(7);
    expect(read?.spacingMiles).toBe(2);
    expect(read?.ranks).toEqual(ranks);
    expect(read?.placeId).toBe("ChIJfictional_place_0001");
  });

  it("anything that isn't a rank 1–20 is 'not in the top 20', never guessed", () => {
    const read = readHeatmap(answer([[0, 21, "x" as unknown as number], [5, null, 2.5], [-1, 20, 1]]));
    expect(read?.ranks).toEqual([[null, null, null], [5, null, null], [null, 20, 1]]);
  });

  it("converts LeadSnap's metres and drops points off the grid", () => {
    const a = answer([[1, 2, 3], [4, 5, 6], [7, 8, 9]], { grid_point_distance_row: 3218.688, grid_distance_measure: "m" });
    (a.points as Record<string, unknown>[]).push({ lat: "45.0", lng: "-80.65", rank: 1 });
    const read = readHeatmap(a);
    expect(read?.spacingMiles).toBe(2);
    expect(read?.ranks).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  });

  it("an unfinished or failed heat map is never drawn", () => {
    expect(readHeatmap(answer([[1, 1, 1], [1, 1, 1], [1, 1, 1]], { status: "queue", status_code: 0 }))?.status).toBe("waiting");
    expect(readHeatmap(answer([[1, 1, 1], [1, 1, 1], [1, 1, 1]], { status: "in_progress", status_code: 1 }))?.status).toBe("waiting");
    expect(readHeatmap(answer([[1, 1, 1], [1, 1, 1], [1, 1, 1]], { status: "failed", status_code: 4 }))?.status).toBe("failed");
    expect(readHeatmap({ id: 1, grid_size: 50 })).toBeNull();
    expect(readHeatmap("nonsense")).toBeNull();
  });

  it("finds the id wherever LeadSnap puts it", () => {
    expect(heatmapId({ id: 7, status: "Pending" })).toBe(7);
    expect(heatmapId([{ id: 8 }])).toBe(8);
    expect(heatmapId({ data: { id: 9 } })).toBe(9);
    expect(heatmapId({ data: [{ id: 10 }] })).toBe(10);
    expect(heatmapId({ message: "nope" })).toBeNull();
  });
});

describe("LeadSnap reuse, leaders and the results block", () => {
  const now = new Date("2026-11-27T12:00:00Z");

  it("reuses a 7×7 heat map of the same search from the last 7 days, never a failed or older one", () => {
    const row = (id: number, created: string, extra: Record<string, unknown> = {}) => ({ id, grid_size: 7, status: "completed", created_at: created, ...extra });
    expect(reusableHeatmap({ data: [row(1, "2026-11-26T10:00:00Z")] }, now)).toBe(1);
    expect(reusableHeatmap({ data: [row(2, "2026-11-26T10:00:00Z", { status: "failed" }), row(3, "2026-11-25T10:00:00Z", { status: "queue" })] }, now)).toBe(3);
    expect(reusableHeatmap({ data: [row(4, "2026-11-10T10:00:00Z")] }, now)).toBeNull();
    expect(reusableHeatmap({ data: [row(5, "2026-11-26T10:00:00Z", { grid_size: 13 })] }, now)).toBeNull();
    expect(reusableHeatmap({}, now)).toBeNull();
  });

  it("leaders: names and top-3 counts only, never the business itself, never contact details", () => {
    const comp = [
      { top_3_points: 30, total_points: 49, place: { google_place_id: "ChIJfictional_place_0001", name: "The business (fictional)" } },
      { top_3_points: 41, total_points: 49, place: { google_place_id: "ChIJother_0002", name: "Rival Roofing (fictional)", phone: "+1 555-0100", address: "1 Main St" } },
      { top_3_points: 12, total_points: 49, place: { google_place_id: "ChIJother_0003", name: "Second Rival <b>(fictional)</b>" } },
      { top_3_points: 0, total_points: 49, place: { name: "Never top 3 (fictional)" } },
      { top_3_points: 60, total_points: 49, place: { name: "Broken (fictional)" } },
    ];
    const leaders = readLeaders(comp, "ChIJfictional_place_0001");
    expect(leaders).toEqual([
      { name: "Rival Roofing (fictional)", top3: 41, points: 49 },
      { name: "Second Rival b(fictional)b", top3: 12, points: 49 },
    ]);
    expect(JSON.stringify(leaders)).not.toMatch(/555|Main St/);
  });

  it("puts the heat map first, replaces an older LeadSnap one and clears the pending note", () => {
    const read = readHeatmap(answer([[1, 2, 3], [4, 5, 6], [7, 8, 9]]))!;
    const heat = heatmapBlock(read, "roofer", "2026-11-27", [{ name: "Rival (fictional)", top3: 4, points: 9 }]);
    const pack = { term: "roofer", kind: "pack", cities: [] };
    const block = { sources: ["dataforseo"], heatmaps: [{ term: "old", kind: "maps", source: "leadsnap" }, pack], leadsnapPending: { id: 4242, term: "roofer" } };
    const next = withHeatmap(block, heat);
    expect(next.heatmaps).toEqual([heat, pack]);
    expect(next.sources).toEqual(["dataforseo", "leadsnap"]);
    expect("leadsnapPending" in next).toBe(false);
    expect(heatPendingOf(block)).toEqual({ id: 4242, term: "roofer" });
    expect(heatPendingOf(next)).toBeNull();
    expect(heatPendingOf({ leadsnapPending: { id: -1, term: "x" } })).toBeNull();
  });
});

describe("Google listing for the heat map", () => {
  const maps = (items: Record<string, unknown>[]) => ({ result: [{ items }], costUsd: 0 });

  it("takes the listing whose website is the business, never a look-alike name", () => {
    const a = maps([
      { title: "Fictional Roofing", domain: "other.example.com", place_id: "ChIJlookalike_0001", latitude: 41, longitude: -80 },
      { title: "Fictional Roofing", url: "https://roof.example.com/", place_id: "ChIJreal_place_0001", latitude: 41.1, longitude: -80.65 },
    ]);
    expect(readPlace(a, "roof.example.com")).toEqual({ placeId: "ChIJreal_place_0001", lat: 41.1, lng: -80.65 });
    expect(readPlace(a, "missing.example.com")).toBeNull();
    expect(readPlace(maps([{ domain: "roof.example.com", place_id: "bad id!", latitude: 41, longitude: -80 }]), "roof.example.com")).toBeNull();
  });
});

describe("LeadSnap module refuses before sending anything", () => {
  it("bad listing ids, searches, grids and heat map ids are blocked", () => {
    const good = { placeId: "ChIJreal_place_0001", keyword: "roofer", lat: LAT, lng: LNG, size: 7, spacingMiles: 2, points: planGrid(LAT, LNG) };
    expect(() => createHeatmap({ ...good, placeId: "../contacts" })).toThrow(LeadSnapError);
    expect(() => createHeatmap({ ...good, keyword: "Roofer; DROP" })).toThrow(LeadSnapError);
    expect(() => createHeatmap({ ...good, size: 13, points: planGrid(LAT, LNG, 13) })).toThrow(LeadSnapError);
    expect(() => createHeatmap({ ...good, points: good.points.slice(1) })).toThrow(LeadSnapError);
    expect(() => getHeatmap(-3)).toThrow(LeadSnapError);
    expect(() => getHeatmap(1.5)).toThrow(LeadSnapError);
  });
});
