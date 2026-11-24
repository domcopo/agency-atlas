// Sales leaderboard (docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md Phase 2): ranking and labels.
// Pure: no database. The totals themselves are added up by the 0026 view (break-in tests 7w).
// Names here are fictional.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { boardSourceLabel, boardUsd, firstName, initials, rankBoard, type BoardRow } from "@/lib/leaderboard";

const row = (name: string, wonUsd: number, extra: Partial<BoardRow> = {}): BoardRow => ({ name, isMe: false, linked: true, wonUsd, wonDeals: wonUsd > 0 ? 1 : 0, ...extra });

describe("sales leaderboard", () => {
  it("ranks the highest Won total first and gives medals only to people who won something", () => {
    const r = rankBoard([row("Rep Zero (sample)", 0), row("Rep Big (sample)", 43256), row("Rep Mid (sample)", 900)]);
    expect(r.map((x) => [x.firstName, x.rank, x.medal])).toEqual([
      ["Rep", 1, "gold"],
      ["Rep", 2, "silver"],
      ["Rep", 3, null],
    ]);
    expect(r[0]?.wonUsd).toBe(43256);
  });

  it("people with the same total share a rank; more deals breaks the display order", () => {
    const r = rankBoard([row("Ann Sample", 0), row("Bo Sample", 0), row("Cy Sample", 500, { wonDeals: 1 }), row("Di Sample", 500, { wonDeals: 2 })]);
    expect(r.map((x) => [x.firstName, x.rank])).toEqual([
      ["Di", 1],
      ["Cy", 1],
      ["Ann", 3],
      ["Bo", 3],
    ]);
  });

  it("someone not linked to GoHighLevel is listed last, unranked, never shown as $0", () => {
    const r = rankBoard([row("Ed Sample", 0, { linked: false }), row("Flo Sample", 0)]);
    expect(r[1]).toMatchObject({ firstName: "Ed", rank: null, medal: null, linked: false });
  });

  it("formats whole dollars, never shortened", () => {
    expect(boardUsd(43256)).toBe("$43,256");
    expect(boardUsd(0)).toBe("$0");
    expect(boardUsd(-5)).toBe("$0");
  });

  it("names: first word and initials, notes in brackets dropped", () => {
    expect(firstName("Sales 1 (test)")).toBe("Sales");
    expect(initials("Pat Q Example")).toBe("PE");
    expect(initials("Solo")).toBe("S");
  });

  it("the card always says where the number comes from", () => {
    expect(boardSourceLabel("sales")).toMatch(/Won this month.*GoHighLevel/);
    expect(boardSourceLabel("all")).toMatch(/all pipelines/);
  });

  it("the board reads only the 0026 view, and the view only ever returns names and totals", () => {
    const ds = readFileSync(join(process.cwd(), "src/lib/data-source.ts"), "utf8");
    expect(ds).toMatch(/from\("sales_leaderboard"\)\.select\("name, is_me, linked, won_usd, won_deals"\)/);
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0026_sales_leaderboard.sql"), "utf8");
    expect(sql).toMatch(/where \(select auth\.jwt\(\) ->> 'aal'\) = 'aal2'\s+and \(select private\.my_role\(\)\) in \('owner', 'manager', 'sales'\)/);
    expect(sql).toMatch(/revoke all on public\.sales_leaderboard from public, anon, authenticated;\ngrant select on public\.sales_leaderboard to authenticated;/);
    expect(sql).not.toMatch(/o\.name|ghl_id\s+as|contact/);
    const card = readFileSync(join(process.cwd(), "src/components/sales/SalesLeaderboard.tsx"), "utf8");
    expect(card).not.toMatch(/dangerouslySetInnerHTML/);
  });
});
