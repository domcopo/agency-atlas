// Reading past Supabase's "Max rows" (docs/REVIEW_2026-11.md, item 1): the newest rows must
// never be the ones silently dropped.
import { describe, expect, it } from "vitest";
import { readAllRows, remainingRanges, type RowPage } from "@/lib/paging";

/** A fake table that, like Supabase, never sends more than `serverMax` rows per request. */
function fakeTable(rows: number, serverMax: number, opts: { failOnPage?: number } = {}) {
  const all = Array.from({ length: rows }, (_, i) => ({ n: i }));
  const calls: { from: number; to: number; withCount: boolean }[] = [];
  const page = async (from: number, to: number, withCount: boolean): Promise<RowPage<{ n: number }>> => {
    calls.push({ from, to, withCount });
    if (opts.failOnPage !== undefined && calls.length - 1 === opts.failOnPage) return { data: null, error: { code: "57014" } };
    const end = Math.min(to + 1, from + serverMax, all.length);
    return { data: all.slice(from, end), error: null, count: withCount ? all.length : null };
  };
  return { page, calls };
}

describe("remainingRanges", () => {
  it("is empty when the first page had everything", () => {
    expect(remainingRanges(800, 800, 5000)).toEqual([]);
    expect(remainingRanges(0, 0, 5000)).toEqual([]);
  });

  it("covers the rest in steps the size of the first page", () => {
    expect(remainingRanges(2500, 1000, 50000)).toEqual([
      [1000, 1999],
      [2000, 2499],
    ]);
  });

  it("stops at the maximum", () => {
    expect(remainingRanges(10000, 1000, 2500)).toEqual([
      [1000, 1999],
      [2000, 2499],
    ]);
  });

  it("follows a server that sends smaller pages than we asked for", () => {
    expect(remainingRanges(1200, 500, 5000)).toEqual([
      [500, 999],
      [1000, 1199],
    ]);
  });
});

describe("readAllRows", () => {
  it("reads every row past the server's 1,000-row cap, including the newest (last) ones", async () => {
    const t = fakeTable(2600, 1000);
    const res = await readAllRows(t.page, 50000);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(2600);
    expect(res.data.at(-1)).toEqual({ n: 2599 });
    expect(new Set(res.data.map((r) => r.n)).size).toBe(2600); // no repeats
    expect(t.calls[0]).toEqual({ from: 0, to: 999, withCount: true });
    expect(t.calls.slice(1).every((c) => !c.withCount)).toBe(true);
  });

  it("makes one request for a small table", async () => {
    const t = fakeTable(40, 1000);
    const res = await readAllRows(t.page, 5000);
    expect(res.data).toHaveLength(40);
    expect(t.calls).toHaveLength(1);
  });

  it("works when the server's cap is lower than 1,000", async () => {
    const t = fakeTable(1300, 250);
    const res = await readAllRows(t.page, 5000);
    expect(res.data.map((r) => r.n)).toEqual(Array.from({ length: 1300 }, (_, i) => i));
  });

  it("never returns more than the maximum", async () => {
    const t = fakeTable(5000, 1000);
    const res = await readAllRows(t.page, 1500);
    expect(res.data).toHaveLength(1500);
  });

  it("passes a missing-table error straight through, with no rows", async () => {
    const res = await readAllRows(async () => ({ data: null, error: { code: "42P01" } }), 5000);
    expect(res).toEqual({ data: [], error: { code: "42P01" } });
  });

  it("returns no rows (not a partial list) if a later page fails", async () => {
    const t = fakeTable(3000, 1000, { failOnPage: 2 });
    const res = await readAllRows(t.page, 5000);
    expect(res.data).toEqual([]);
    expect(res.error).toEqual({ code: "57014" });
  });

  it("reads only the first page when the count is unavailable", async () => {
    const res = await readAllRows(async (from, to) => ({ data: Array.from({ length: to - from + 1 }, (_, i) => ({ n: from + i })), error: null, count: null }), 5000);
    expect(res.data).toHaveLength(1000);
  });
});
