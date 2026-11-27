// Work hub rules (docs/WORK_HUB_PLAN.md): filters from the address, chip counts,
// list groups and the due-date wording. Synthetic items only.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ClientAction } from "@/lib/types";
import {
  chipCounts,
  doneThisWeek,
  dueHint,
  groupForList,
  hubHref,
  initials,
  inScope,
  legacyOrdersHref,
  matchesChip,
  parseHubFilters,
  savedViews,
  SUGGESTION_RULES,
  suggestionKey,
  loadTone,
  teamLoad,
  WEEKLY_CAPACITY_MINUTES,
  withoutDismissed,
  type HubFilters,
} from "@/lib/work-hub";

const TODAY = "2026-11-25";
const STAFF = "00000000-0000-0000-0000-0000000000a1";
const OTHER = "00000000-0000-0000-0000-0000000000a2";

let n = 0;
function item(over: Partial<ClientAction> = {}): ClientAction {
  n++;
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    kind: "work_order",
    title: `Sample task ${n}`,
    notes: null,
    priority: "normal",
    status: "open",
    dueOn: null,
    doneAt: null,
    createdAt: "2026-11-01T00:00:00Z",
    ownerId: STAFF,
    ownerName: "Developer (sample)",
    client: { slug: "pat-example", dbId: "x", name: "Pat Example Plumbing (sample)" },
    leadGhlId: null,
    ...over,
  };
}

const base: HubFilters = { view: "list", q: "" };
const known = { staffIds: [STAFF, OTHER], clientSlugs: ["pat-example"] };

describe("work hub filters", () => {
  it("reads only known values from the address", () => {
    expect(parseHubFilters({ view: "board", chip: "blocked", who: STAFF, client: "pat-example", type: "issue", prio: "high", q: "  fix   form " }, known)).toEqual({
      view: "board",
      q: "fix form",
      chip: "blocked",
      who: STAFF,
      client: "pat-example",
      type: "issue",
      prio: "high",
      open: undefined,
    });
    expect(parseHubFilters({ view: "x", chip: "nope", who: "someone", client: "../billing", type: "x", prio: "x", open: "1 OR 1=1" }, known)).toEqual({ view: "list", q: "", chip: undefined, who: undefined, client: undefined, type: undefined, prio: undefined, open: undefined });
    expect(parseHubFilters({ open: STAFF.toUpperCase() }, known).open).toBe(STAFF);
    expect(parseHubFilters({ who: "none" }, known).who).toBeNull();
  });

  it("builds addresses that round-trip", () => {
    const f = parseHubFilters({ chip: "overdue", who: "none", q: "seo" }, known);
    expect(hubHref(f)).toBe("/work?q=seo&chip=overdue&who=none");
    expect(hubHref(f, { chip: undefined })).toBe("/work?q=seo&who=none");
    expect(hubHref(base, { view: "list" })).toBe("/work");
    expect(hubHref(base, { view: "team", who: STAFF })).toBe(`/work?view=team&who=${STAFF}`);
    expect(hubHref({ ...f, open: STAFF }, { chip: undefined })).toBe(`/work?q=seo&who=none&open=${STAFF}`);
    expect(hubHref({ ...f, open: STAFF }, { open: undefined })).toBe("/work?q=seo&chip=overdue&who=none");
  });

  it("turns old Work orders addresses into Work hub ones", () => {
    expect(legacyOrdersHref({})).toBe("/work");
    expect(legacyOrdersHref({ status: "blocked", who: STAFF, view: "board" })).toBe(`/work?view=board&chip=blocked&who=${STAFF}`);
    expect(legacyOrdersHref({ due: "overdue", client: "pat-example" })).toBe("/work?chip=overdue&client=pat-example");
    expect(legacyOrdersHref({ who: "<script>", client: "Bad Slug" })).toBe("/work");
    expect(legacyOrdersHref({ new: "1" })).toBe("/work?new=1");
    expect(legacyOrdersHref({ suggest: "1", new: "yes" })).toBe("/work?suggest=1");
  });

  it("filters by person, client, type, priority and search; skips archived and canceled", () => {
    const a = item({ title: "Fix contact form", priority: "high" });
    const b = item({ ownerId: null, ownerName: null, kind: "issue" });
    const c = item({ archivedAt: "2026-11-20T00:00:00Z" });
    const d = item({ status: "canceled" });
    const e = item({ ownerId: OTHER, steps: "Check the contact form\nTest it" });
    const all = [a, b, c, d, e];
    expect(inScope(all, base)).toEqual([a, b, e]);
    expect(inScope(all, { ...base, who: null })).toEqual([b]);
    expect(inScope(all, { ...base, type: "issue" })).toEqual([b]);
    expect(inScope(all, { ...base, prio: "high" })).toEqual([a]);
    expect(inScope(all, { ...base, q: "CONTACT form" })).toEqual([a, e]);
  });
});

describe("work hub chips and groups", () => {
  it("counts each chip on the items in view", () => {
    const items = [
      item({ dueOn: "2026-11-20" }),
      item({ dueOn: TODAY, status: "waiting" }),
      item({ dueOn: "2026-11-27", status: "blocked", ownerId: null }),
      item({ status: "review" }),
      item({ dueOn: "2026-11-01", status: "done", doneAt: "2026-11-24T10:00:00Z" }),
      item({ dueOn: "2026-12-30", promisedOn: "2026-11-24" }),
    ];
    expect(chipCounts(items, TODAY)).toEqual({ overdue: 2, today: 1, upcoming: 1, waiting: 1, blocked: 1, unassigned: 1, review: 1 });
    expect(items.filter((a) => matchesChip(a, "now", TODAY))).toHaveLength(3);
  });

  it("groups open items into Overdue, Today, This week and Later, urgent first", () => {
    const late = item({ dueOn: "2026-11-24" });
    const today = item({ dueOn: TODAY });
    const urgentWeek = item({ dueOn: "2026-12-01", priority: "critical" });
    const week = item({ dueOn: "2026-11-26" });
    const later = item({ dueOn: "2026-12-02" });
    const none = item();
    const done = item({ status: "done", doneAt: "2026-11-25T09:00:00Z" });
    const g = groupForList([later, week, urgentWeek, today, late, none, done], TODAY);
    expect(g.overdue).toEqual([late]);
    expect(g.today).toEqual([today]);
    expect(g.week).toEqual([urgentWeek, week]);
    expect(g.later).toEqual([later, none]);
    expect(doneThisWeek([done, late, item({ status: "done", doneAt: "2026-11-01T00:00:00Z" })], TODAY)).toEqual([done]);
  });

  it("words due dates with the real date and a hint", () => {
    expect(dueHint("2026-11-20", TODAY)).toEqual({ text: "Nov 20 · 5d late", tone: "late" });
    expect(dueHint(TODAY, TODAY)).toEqual({ text: "Today", tone: "today" });
    expect(dueHint("2026-11-26", TODAY)).toEqual({ text: "Tomorrow", tone: "soon" });
    expect(dueHint("2026-11-28", TODAY)).toEqual({ text: "Nov 28 · in 3d", tone: "soon" });
    expect(dueHint("2027-01-05", TODAY)).toEqual({ text: "Jan 5, 2027 · in 41d", tone: "later" });
    expect(dueHint(null, TODAY)).toEqual({ text: "No date", tone: "none" });
  });

  it("makes initials and saved views", () => {
    expect(initials("Developer Sample")).toBe("DS");
    expect(initials("Founder")).toBe("FO");
    expect(savedViews(null).map((v) => v.id)).toEqual(["overdue", "unassigned", "blocked"]);
    expect(savedViews(STAFF)[0]).toEqual({ id: "mine", label: "My work today", set: { who: STAFF, chip: "now" } });
  });
});

describe("migration 0038", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0038_work_hub.sql"), "utf8").replace(/--.*$/gm, "");

  it("locks the dismissals table: RLS, two-factor, add-only, owner/managers only", () => {
    expect(sql).toMatch(/alter table public\.work_suggestion_dismissals\s+enable row level security/);
    expect(sql).toMatch(/create policy work_suggestion_dismissals_requires_2fa on public\.work_suggestion_dismissals as restrictive/);
    expect(sql).not.toMatch(/grant[^;]*(update|delete)[^;]*work_suggestion_dismissals/i);
    expect(sql).toMatch(/grant insert \(client_id, rule, reason\) on public\.work_suggestion_dismissals/);
  });

  it("lets only the owner and managers write Done when, without rewriting older rules", () => {
    expect(sql).toMatch(/create trigger actions_done_when_guard before insert or update on public\.actions/);
    expect(sql).not.toMatch(/actions_developer_guard/);
    expect(sql).not.toMatch(/\bdrop\b/i);
  });
});

describe("dismissed suggestions", () => {
  const s1 = { clientSlug: "pat-example", why: "No work in 30 days.", rule: "routine" as const };
  const s2 = { clientSlug: "pat-example", why: "At risk (score 40): quiet for 3 weeks", rule: "risk" as const };
  const loose = { clientSlug: null, why: "Agency-wide idea", rule: "routine" as const };

  it("hides a suggestion only for the same client, rule and reason", () => {
    const dismissed = new Set([suggestionKey("pat-example", "routine", "No work in 30 days.")]);
    expect(withoutDismissed([s1, s2, loose], (s) => s.rule, dismissed)).toEqual([s2, loose]);
    // A new reason (different text) shows again.
    expect(withoutDismissed([{ ...s1, why: "No work in 45 days." }], (s) => s.rule, dismissed)).toHaveLength(1);
    // The same reason under another rule (an AI draft) is its own suggestion.
    expect(withoutDismissed([s1], () => "ai", dismissed)).toHaveLength(1);
  });

  it("matches the rules 0038 allows, and Dismiss checks the role before saving", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0038_work_hub.sql"), "utf8");
    expect(sql).toContain(`check (rule in (${SUGGESTION_RULES.map((r) => `'${r}'`).join(", ")}))`);
    const actions = readFileSync(join(process.cwd(), "src/app/actions.ts"), "utf8");
    const body = actions.slice(actions.indexOf("export async function dismissSuggestion"), actions.indexOf("\n}\n", actions.indexOf("export async function dismissSuggestion")));
    expect(body).toMatch(/\{\n {2}await notWhilePreviewing\(\);\n {2}const me = await getCurrentMember\(\);/);
    expect(body.indexOf('me.role !== "manager"')).toBeLessThan(body.indexOf(".insert("));
    expect(body).toMatch(/\.insert\(\{ client_id: client\.dbId, rule, reason \}\)/);
  });
});

describe("team load", () => {
  const FOUNDER = "00000000-0000-0000-0000-0000000000a9";
  const team = [
    { id: STAFF, name: "Developer (sample)", role: "seo_developer" },
    { id: OTHER, name: "Manager (sample)", role: "client_manager" },
    { id: FOUNDER, name: "Founder (sample)", role: "founder" },
  ];

  it("counts open hours due in the next 7 days against 25 h a week", () => {
    expect(WEEKLY_CAPACITY_MINUTES).toBe(1500);
    const items = [
      item({ dueOn: "2026-11-20", estMinutes: 600 }), // overdue: counts
      item({ dueOn: TODAY, estMinutes: 480 }),
      item({ dueOn: "2026-12-01" }), // day 6, no estimate: 60 min
      item({ dueOn: "2026-12-02", estMinutes: 240 }), // day 7: not this week
      item({ status: "review", dueOn: TODAY, estMinutes: 300 }), // waiting for review: not open
      item({ status: "done", dueOn: TODAY }),
      item({ ownerId: null, ownerName: null, dueOn: TODAY, estMinutes: 120 }),
      item({ ownerId: FOUNDER, dueOn: TODAY, estMinutes: 900 }),
    ];
    const { rows, totals } = teamLoad({ actions: items, team, today: TODAY, includeFounder: false });
    const dev = rows.find((r) => r.staffId === STAFF)!;
    expect(dev).toMatchObject({ weekMinutes: 1140, openMinutes: 1380, openItems: 4, overdue: 1, withoutEstimate: 1, percent: 76, tone: "green", counted: true });
    expect(rows.find((r) => r.staffId === FOUNDER)).toMatchObject({ counted: false, weekMinutes: 900 });
    // The founder is last and left out of the team total unless switched on.
    expect(rows.map((r) => r.staffId)).toEqual([STAFF, OTHER, FOUNDER]);
    expect(totals).toEqual({ weekMinutes: 1140, capacityMinutes: 3000, percent: 38, tone: "green", unassignedMinutes: 120 });
    const withFounder = teamLoad({ actions: items, team, today: TODAY, includeFounder: true });
    expect(withFounder.totals).toMatchObject({ weekMinutes: 2040, capacityMinutes: 4500, percent: 45 });
    expect(withFounder.rows[0]!.staffId).toBe(STAFF);
  });

  it("colors the load bar green, amber and red", () => {
    expect([0, 79, 80, 100, 101].map(loadTone)).toEqual(["green", "green", "amber", "amber", "red"]);
  });
});

describe("Phase 5 polish", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("shortcuts never fire while typing or in a pop-up, and X only presses the focused row's own Done box", () => {
    const keys = read("src/components/work/HubShortcuts.tsx");
    expect(keys).toContain('if (typing(e.target) || document.querySelector("dialog[open]")) return;');
    expect(keys).toContain("e.metaKey || e.ctrlKey || e.altKey");
    expect(keys).toMatch(/key === "x" && current\)/);
    expect(keys).toContain('current.querySelector<HTMLButtonElement>("[data-row-done]")');
    // No server actions or network from the shortcut file itself.
    expect(keys).not.toMatch(/@\/app\/actions|fetch\(/);
    const row = read("src/components/work/WorkRow.tsx");
    expect(row).toContain("data-hub-row");
    expect(row).toContain("<DoneBox id={a.id}"); // the Done box (with data-row-done) lives in UndoToast.tsx
    expect(row).toContain("data-row-open");
  });

  it("the error screen never shows the error's own text", () => {
    const err = read("src/app/(app)/work/error.tsx");
    expect(err).not.toMatch(/\.message|String\(error\)|JSON\.stringify/);
  });

  it("hub screens keep red for late and blocked work only", () => {
    expect(read("src/components/cards/WorkOrderBoard.tsx")).not.toMatch(/urgent && <span className="text-rose/);
    expect(read("src/components/work/WorkRow.tsx")).toContain('a.priority === "critical" ? { ...priorityTone.critical, label: "Urgent", dot: "bg-due-orange" }');
  });

  it("hub spacing sits on the 8px scale (no 6, 10 or 14 px gaps)", () => {
    const files = ["src/components/work/WorkRow.tsx", "src/components/work/WorkHeader.tsx", "src/components/work/WorkPopups.tsx", "src/components/work/WorkOrderDetail.tsx", "src/components/work/TeamView.tsx", "src/components/cards/WorkOrderBoard.tsx", "src/app/(app)/work/page.tsx"];
    for (const f of files) expect(read(f), f).not.toMatch(/[\s"`:](?:-?(?:m|mt|mb|ml|mr|mx|my|p|pt|pb|pl|pr|px|py|gap|gap-x|gap-y|space-y|space-x))-(?:1\.5|2\.5|3\.5)[\s"`]/);
  });
});

describe("Undo and the Shortcuts list", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("Undo is an ordinary status change back, through updateAction (no new write path)", () => {
    const undo = read("src/components/work/UndoToast.tsx");
    expect(undo).toContain('import { updateAction } from "@/app/actions";');
    expect(undo).toContain('fd.set("op", "status");');
    expect(undo).not.toMatch(/fetch\(|createDatabaseClient|\.from\(/);
    // The Done box keeps the marker X presses, and approves items that are in review.
    expect(undo).toContain("data-row-done");
    expect(undo).toContain('fd.set("op", review ? "approve" : "done");');
    // Z is ignored while typing or in a pop-up.
    expect(undo).toContain('if (typing(e.target) || document.querySelector("dialog[open]")) return;');
  });

  it("the board offers Undo with the card's old status after a move", () => {
    expect(read("src/components/cards/WorkOrderBoard.tsx")).toContain("before: { status: card.status, reason: card.blockedReason }");
  });

  it("the Work hub migration is 0038 (0037 is the audit spend fix on main)", () => {
    expect(read("supabase/migrations/0038_work_hub.sql")).toMatch(/^-- Agency Atlas: Work hub fields/);
  });
});
