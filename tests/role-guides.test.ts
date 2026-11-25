// Role guides, personal goals and ideas (docs/ROLE_GUIDES_PLAN.md, 0036).
// Who sees what is decided on the server from the DATABASE role; these tests check the pure
// rules, that the guides match the real app, and that the data layer never hands a developer
// (or salesperson, or VA) another role's guide, another person's goals, or anyone's ideas,
// even if the database returned more than it should. The database itself is tested in
// supabase/tests/10_rls_break_in.sql (section 7ce).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODE_TABS, type NavMode } from "@/components/shell/BottomNav";
import { toadModeFor } from "@/lib/ai/toad-snapshot";
import { checkGoal, checkIdea, IDEA_RULES, sortGoals, type PersonGoal } from "@/lib/ideas";
import {
  asGuideRole,
  canEditGuide,
  featuresFor,
  GUIDE_FEATURES,
  GUIDE_HELPERS,
  GUIDE_PARTS,
  guidesFor,
  helpersFor,
  mergeGuide,
  STARTER_GUIDES,
  type GuideEdit,
} from "@/lib/role-guides";
import { MEMBER_ROLES, type MemberRole } from "@/lib/roles";

const ROOT = join(__dirname, "..");
const NAV: Record<MemberRole, NavMode> = { owner: "full", manager: "full", developer: "developer", sales: "sales", va: "va" };

describe("who reads which guide", () => {
  it("owner and managers read all five; everyone else only their own", () => {
    expect(guidesFor("owner")).toEqual([...MEMBER_ROLES]);
    expect(guidesFor("manager")).toEqual([...MEMBER_ROLES]);
    expect(guidesFor("developer")).toEqual(["developer"]);
    expect(guidesFor("sales")).toEqual(["sales"]);
    expect(guidesFor("va")).toEqual(["va"]);
    expect(guidesFor(null)).toEqual([]);
    expect(guidesFor(undefined)).toEqual([]);
  });

  it("only the owner edits the owner's guide; managers edit the rest; nobody else edits", () => {
    for (const g of MEMBER_ROLES) {
      expect(canEditGuide("owner", g)).toBe(true);
      expect(canEditGuide("manager", g)).toBe(g !== "owner");
      for (const r of ["developer", "sales", "va", null] as const) expect(canEditGuide(r, g)).toBe(false);
    }
  });

  it("an unknown role in the address is refused", () => {
    expect(asGuideRole("developer")).toBe("developer");
    for (const bad of ["admin", "Owner", "", "../billing", "developer/", undefined]) expect(asGuideRole(bad)).toBeNull();
  });
});

describe("the guides match the real app", () => {
  it("every role has a complete starter guide", () => {
    for (const r of MEMBER_ROLES) {
      const g = STARTER_GUIDES[r];
      expect(g.role).toBe(r);
      for (const p of GUIDE_PARTS) expect(g.parts[p.key].trim().length, `${r}.${p.key}`).toBeGreaterThan(20);
    }
  });

  it("every feature a guide lists is on a tab that role actually has", () => {
    for (const r of MEMBER_ROLES) {
      const tabs = MODE_TABS[NAV[r]];
      for (const f of featuresFor(r)) if (tabs) expect(tabs, `${r} → ${f.id}`).toContain(f.tab);
    }
  });

  it("every link in a guide goes to a real screen", () => {
    for (const f of GUIDE_FEATURES) {
      if (!f.href) continue;
      const dir = f.href === "/" ? "" : f.href;
      expect(existsSync(join(ROOT, "src/app/(app)", dir, "page.tsx")), f.href).toBe(true);
    }
  });

  it("BizToad is listed exactly for the roles BizToad allows", () => {
    const toad = GUIDE_HELPERS.find((h) => h.id === "biztoad")!;
    for (const r of MEMBER_ROLES) expect(toad.roles.includes(r), r).toBe(toadModeFor(r) !== null);
  });

  it("VAs get no AI helpers; developers get no Atlas AI besides BizToad", () => {
    expect(helpersFor("va").filter((h) => h.usesAi)).toEqual([]);
    expect(helpersFor("developer").filter((h) => h.usesAi).map((h) => h.id)).toEqual(["biztoad"]);
  });

  it("billing, the owner feed and the GoHighLevel sync appear only in the owner's guide", () => {
    for (const id of ["billing"]) expect(GUIDE_FEATURES.find((f) => f.id === id)!.roles).toEqual(["owner"]);
    for (const id of ["owner_feed", "ghl_sync"]) expect(GUIDE_HELPERS.find((h) => h.id === id)!.roles).toEqual(["owner"]);
  });

  it("developers, salespeople and VAs aren't promised screens they can't open", () => {
    const ids = (r: MemberRole) => featuresFor(r).map((f) => f.id);
    expect(ids("developer")).not.toContain("clients");
    expect(ids("developer")).not.toContain("sales");
    expect(ids("sales")).not.toContain("work_orders");
    expect(ids("va")).not.toContain("work_orders");
    expect(ids("va")).not.toContain("sales");
    expect(ids("va")).not.toContain("safety"); // the Data Safety screen shows VAs a RoleNotice
  });
});

describe("guide edits", () => {
  const edit = (e: Partial<GuideEdit>): GuideEdit => ({ id: "e1", role: "developer", part: "duties", title: null, body: "Edited duties", position: 0, updatedAt: "2026-11-25T10:00:00Z", ...e });

  it("starter text shows until an edit replaces a part; the newest edit wins", () => {
    const plain = mergeGuide("developer", []);
    expect(plain.map((s) => s.key)).toEqual(["duties", "goals", "how_to"]);
    expect(plain.every((s) => !s.edited)).toBe(true);
    const merged = mergeGuide("developer", [edit({ id: "old", body: "Old" }), edit({ id: "new", body: "New", updatedAt: "2026-11-25T11:00:00Z" })]);
    expect(merged[0]).toMatchObject({ body: "New", editId: "new", edited: true });
    expect(merged[1]!.body).toBe(STARTER_GUIDES.developer.parts.goals);
  });

  it("added sections come after the starter parts, in order", () => {
    const merged = mergeGuide("sales", [
      edit({ id: "b", role: "sales", part: "extra", title: "Second", position: 2 }),
      edit({ id: "a", role: "sales", part: "extra", title: "First", position: 1 }),
    ]);
    expect(merged.map((s) => s.title).slice(3)).toEqual(["First", "Second"]);
  });

  it("an edit to another role's guide never shows in this one", () => {
    const merged = mergeGuide("developer", [edit({ role: "sales", body: "Sales only" }), edit({ id: "x", role: "owner", part: "extra", title: "Owner secret" })]);
    expect(merged.some((s) => s.body === "Sales only" || s.title === "Owner secret")).toBe(false);
  });
});

describe("ideas and goals checks", () => {
  it("an idea needs a kind and a title, is trimmed, and refuses passwords and keys", () => {
    expect(checkIdea({ kind: "feature", title: "  Show calls  on Home ", details: "So I see them first" })).toEqual({ ok: true, idea: { kind: "feature", title: "Show calls on Home", details: "So I see them first" } });
    expect(checkIdea({ kind: "wish", title: "x", details: "" }).ok).toBe(false);
    expect(checkIdea({ kind: "feature", title: "   ", details: "" }).ok).toBe(false);
    expect(checkIdea({ kind: "broken", title: "Login", details: "password: hunter2" }).ok).toBe(false);
    const long = checkIdea({ kind: "easier", title: "t".repeat(500), details: "d".repeat(9000) });
    expect(long.ok && long.idea.title.length === IDEA_RULES.title && long.idea.details.length === IDEA_RULES.details).toBe(true);
  });

  it("a goal needs text and an optional real date", () => {
    expect(checkGoal("Finish audits", "2026-12-01")).toEqual({ ok: true, goal: "Finish audits", dueOn: "2026-12-01" });
    expect(checkGoal("Finish audits", "")).toEqual({ ok: true, goal: "Finish audits", dueOn: null });
    expect(checkGoal("", "").ok).toBe(false);
    expect(checkGoal("x", "next week").ok).toBe(false);
    expect(checkGoal("pwd = secret1", "").ok).toBe(false);
  });

  it("open goals come first, soonest date first", () => {
    const g = (id: string, dueOn: string | null, doneAt: string | null): PersonGoal => ({ id, userId: "u", goal: id, dueOn, doneAt });
    expect(sortGoals([g("done", null, "2026-11-20"), g("later", "2026-12-20", null), g("nodate", null, null), g("soon", "2026-12-01", null)]).map((x) => x.id)).toEqual(["soon", "later", "nodate", "done"]);
  });
});

// ---------------------------------------------------------------------------
// The data layer, with a database that (wrongly) returns EVERY row: the server must still
// hand each person only what they may see. Fictional ids only.
// ---------------------------------------------------------------------------

const ME = { owner: "00000000-0000-0000-0000-0000000000a1", developer: "00000000-0000-0000-0000-0000000000a3", developer2: "00000000-0000-0000-0000-0000000000a5", sales: "00000000-0000-0000-0000-0000000000a6", va: "00000000-0000-0000-0000-0000000000a8" };
const TABLES: Record<string, Record<string, unknown>[]> = {
  role_guide_parts: MEMBER_ROLES.map((r, i) => ({ id: `00000000-0000-0000-0000-00000000ba0${i}`, role: r, part: "extra", title: `${r} extra`, body: `${r} text`, position: 0, updated_at: "2026-11-25T10:00:00Z" })),
  person_goals: [
    { id: "g1", user_id: ME.developer, goal: "Developer goal", due_on: null, done_at: null },
    { id: "g2", user_id: ME.developer2, goal: "Other developer goal", due_on: null, done_at: null },
    { id: "g3", user_id: ME.sales, goal: "Sales goal", due_on: null, done_at: null },
  ],
  ideas: [
    { id: "i1", created_by: ME.developer, kind: "feature", title: "Developer idea", details: "", status: "new", reply: null, created_at: "2026-11-25T10:00:00Z" },
    { id: "i2", created_by: ME.sales, kind: "easier", title: "Sales idea", details: "", status: "new", reply: null, created_at: "2026-11-25T09:00:00Z" },
  ],
  team_members: [
    { user_id: ME.owner, display_name: "Owner (test)", role: "owner" },
    { user_id: ME.developer, display_name: "Developer (test)", role: "developer" },
    { user_id: ME.sales, display_name: "Sales (test)", role: "sales" },
  ],
};

function fakeDb() {
  const from = (table: string) => {
    const result = { data: TABLES[table] ?? [], error: null };
    const single = { data: null, error: null };
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "gte"]) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve(single);
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad);
    return q;
  };
  return { from };
}

let current: { userId: string; role: MemberRole } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  isDatabaseConfigured: () => true,
  createDatabaseClient: async () => fakeDb(),
  getCurrentMember: async () => (current ? { ...current, name: "Test", staffId: null, ghlUserId: null } : null),
  getTwoFactorState: async () => ({ enrolled: true }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, has: () => false }) }));

async function as(role: keyof typeof ME, memberRole: MemberRole) {
  current = { userId: ME[role], role: memberRole };
  vi.resetModules();
  return import("@/lib/data-source");
}

describe("the data layer hands each person only their own (even if the database returned more)", () => {
  beforeEach(() => {
    current = null;
  });

  it("a developer gets only the developer guide and its edits", async () => {
    const ds = await as("developer", "developer");
    const v = await ds.getRoleGuides();
    expect(v.roles).toEqual(["developer"]);
    expect(v.edits.map((e) => e.role)).toEqual(["developer"]);
  });

  it("a salesperson and a VA get only their own guide", async () => {
    expect((await (await as("sales", "sales")).getRoleGuides()).edits.map((e) => e.role)).toEqual(["sales"]);
    expect((await (await as("va", "va")).getRoleGuides()).edits.map((e) => e.role)).toEqual(["va"]);
  });

  it("the owner gets every guide", async () => {
    const v = await (await as("owner", "owner")).getRoleGuides();
    expect(v.roles).toEqual([...MEMBER_ROLES]);
    expect(new Set(v.edits.map((e) => e.role))).toEqual(new Set(MEMBER_ROLES));
  });

  it("a developer gets only their own goals, never another person's, and no team list", async () => {
    const g = await (await as("developer", "developer")).getGoals();
    expect(g.mine.map((x) => x.goal)).toEqual(["Developer goal"]);
    expect(g.team).toEqual([]);
  });

  it("a developer sees only their own ideas, and no inbox", async () => {
    const i = await (await as("developer", "developer")).getIdeas();
    expect(i.mine.map((x) => x.title)).toEqual(["Developer idea"]);
    expect(i.inbox).toEqual([]);
    expect(i.isOwner).toBe(false);
  });

  it("the owner's inbox has every idea with who sent it", async () => {
    const i = await (await as("owner", "owner")).getIdeas();
    expect(i.inbox.map((x) => [x.title, x.from])).toEqual([
      ["Developer idea", "Developer (test)"],
      ["Sales idea", "Sales (test)"],
    ]);
  });

  it("the guide screen refuses a role the server didn't allow", () => {
    const page = readFileSync(join(ROOT, "src/app/(app)/kit/guides/[role]/page.tsx"), "utf8");
    expect(page).toMatch(/if \(!role \|\| !view\.roles\.includes\(role\)\) notFound\(\);/);
    const ds = readFileSync(join(ROOT, "src/lib/data-source.ts"), "utf8");
    expect(ds).toMatch(/const roles = preview \? \(\["developer"\] as MemberRole\[\]\) : guidesFor\(me\.role\);/);
  });
});

describe("guardrails for guides, goals and ideas", () => {
  const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

  it("ideas and goals are never given to the AI or sent anywhere", () => {
    for (const f of ["src/lib/ai/client.ts", "src/lib/ai/snapshot.ts", "src/lib/ai/toad-snapshot.ts", "src/lib/owner-summary.ts"]) {
      expect(read(f), f).not.toMatch(/["'`]ideas["'`]|getIdeas|getGoals|person_goals|role_guide_parts|@\/lib\/ideas/);
    }
    for (const f of ["src/lib/ideas.ts", "src/lib/role-guides.ts"]) expect(read(f), f).not.toMatch(/fetch\(|@\/lib\/ai\//);
  });

  it("every new action refuses while previewing, and only the owner reviews ideas", () => {
    const actions = read("src/app/actions.ts");
    for (const name of ["saveGuidePart", "resetGuidePart", "addGoal", "goalOp", "sendIdea", "reviewIdea"]) {
      const start = actions.indexOf(`export async function ${name}`);
      expect(start, name).toBeGreaterThan(-1);
      expect(actions.slice(start, start + 400), name).toMatch(/\{\n {2}await notWhilePreviewing\(\);/);
    }
    const review = actions.slice(actions.indexOf("export async function reviewIdea"));
    expect(review.slice(0, 400)).toMatch(/if \(me\?\.role !== "owner"\) return;/);
  });

  it("a preview can open the developer guide, and only that guide", async () => {
    const { previewAllows } = await import("@/lib/preview");
    expect(previewAllows("/kit/guides/developer")).toBe(true);
    for (const p of ["/kit/guides/owner", "/kit/guides/sales", "/kit/ideas", "/kit/goals", "/kit/guides/developer/../owner"]) expect(previewAllows(p), p).toBe(false);
  });

  it("0036 has RLS and a two-factor rule on each new table, and grants no deletes", () => {
    const sql = read("supabase/migrations/0036_role_guides.sql");
    for (const t of ["role_guide_parts", "role_guide_part_versions", "person_goals", "ideas"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
      expect(sql).toMatch(new RegExp(`create policy ${t}_requires_2fa on public\\.${t} as restrictive`));
    }
    expect(sql).not.toMatch(/grant[^;]*delete/i);
  });
});
