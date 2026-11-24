// Client care, Step 1A (docs/CLIENT_CARE_PLAN.md): plan tiers, Add client helpers,
// owner-only amounts, and the guardrails that keep amounts away from everyone else.
// All names here are fictional.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { autoSyncDue, CARE_RULES, parseCarePlan, parseMonthly, pickableTiers, planRhythm, similarClients, slugFromName, uniqueSlug } from "@/lib/care";
import { byImportance, isImportant, opportunities, planLabel, scorePriority, servicesLabel } from "@/lib/ops";
import type { CarePlan, RosterClient } from "@/lib/types";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const tierForm = {
  service: "SEO",
  name: "Growth",
  rank: "2",
  hours: "20",
  includes: "- Monthly SEO report\n\n• Competitor review every quarter  ",
  heatMaps: "2",
  reportEveryDays: "30",
  midMonth: true,
  competitorReviewMonths: "3",
  topTier: false,
};

const plan = (over: Partial<CarePlan>): CarePlan => ({
  id: "p1",
  service: "SEO",
  name: "Starter",
  rank: 1,
  hoursPerMonth: 10,
  includes: [],
  heatMapsPerMonth: 2,
  reportEveryDays: 30,
  midMonthCheckIn: true,
  competitorReviewMonths: 0,
  topTier: false,
  archived: false,
  ...over,
});

const client = (over: Partial<RosterClient>): RosterClient => ({
  id: "sample-co",
  name: "Sample Co (fictional)",
  monthlyUsd: null,
  startDate: "2026-01-05",
  status: "active",
  listedIn: [],
  services: ["SEO"],
  ...over,
});

describe("plan tiers", () => {
  it("cleans a tier form: bullets and blank lines dropped, numbers checked", () => {
    const r = parseCarePlan(tierForm);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan).toMatchObject({ service: "SEO", name: "Growth", rank: 2, hoursPerMonth: 20, heatMapsPerMonth: 2, reportEveryDays: 30, competitorReviewMonths: 3, midMonthCheckIn: true, topTier: false });
    expect(r.plan.includes).toEqual(["Monthly SEO report", "Competitor review every quarter"]);
  });

  it("blank hours and heat maps are allowed (Growth isn't decided yet)", () => {
    const r = parseCarePlan({ ...tierForm, hours: "", heatMaps: "" });
    expect(r.ok && r.plan.hoursPerMonth === null && r.plan.heatMapsPerMonth === null).toBe(true);
  });

  it("refuses bad input with a plain-English reason", () => {
    expect(parseCarePlan({ ...tierForm, service: "Plumbing" }).ok).toBe(false);
    expect(parseCarePlan({ ...tierForm, name: "  " }).ok).toBe(false);
    expect(parseCarePlan({ ...tierForm, name: "x".repeat(41) }).ok).toBe(false);
    expect(parseCarePlan({ ...tierForm, rank: "0" }).ok).toBe(false);
    expect(parseCarePlan({ ...tierForm, hours: "5000" }).ok).toBe(false);
    expect(parseCarePlan({ ...tierForm, hours: "-3" }).ok).toBe(false);
    expect(parseCarePlan({ ...tierForm, reportEveryDays: "3" }).ok).toBe(false);
    expect(parseCarePlan({ ...tierForm, heatMaps: "9" }).ok).toBe(false);
    expect(parseCarePlan({ ...tierForm, includes: Array.from({ length: CARE_RULES.includesMax + 1 }, (_, i) => `Line ${i}`).join("\n") }).ok).toBe(false);
    expect(parseCarePlan({ ...tierForm, includes: "y".repeat(CARE_RULES.lineMax + 1) }).ok).toBe(false);
    const bad = parseCarePlan({ ...tierForm, rank: "abc" });
    expect(!bad.ok && bad.error).toMatch(/Order/);
  });

  it("describes the rhythm in words", () => {
    expect(planRhythm(plan({ competitorReviewMonths: 3 }))).toBe("Up to 10 hours a month · monthly report · mid-month check-in · 2 heat maps a month · quarterly competitor review");
    expect(planRhythm(plan({ hoursPerMonth: null, heatMapsPerMonth: null, midMonthCheckIn: false, reportEveryDays: 14 }))).toBe("Report every 14 days");
  });

  it("only offers live tiers of that service, lowest first (plus the client's archived one)", () => {
    const plans = [plan({ id: "pro", name: "Pro", rank: 3 }), plan({ id: "old", name: "Old", rank: 2, archived: true }), plan({ id: "st", rank: 1 }), plan({ id: "ads", service: "Ads", name: "Ads Basic" })];
    expect(pickableTiers(plans, "SEO").map((p) => p.id)).toEqual(["st", "pro"]);
    expect(pickableTiers(plans, "SEO", "old").map((p) => p.id)).toEqual(["st", "old", "pro"]);
  });
});

describe("add client helpers", () => {
  it("makes a clean page address from a name", () => {
    expect(slugFromName("Sam's Plumbing & Heat (fictional)")).toBe("sams-plumbing-heat-fictional");
    expect(slugFromName("Café Örnek")).toBe("cafe-ornek");
    expect(slugFromName("!!!")).toBe("client");
    expect(slugFromName("x".repeat(200)).length).toBeLessThanOrEqual(80);
    expect(slugFromName("Name " + "y".repeat(200))).toMatch(/^[a-z0-9-]{1,90}$/);
  });

  it("never reuses an address", () => {
    expect(uniqueSlug("Sample Co", [])).toBe("sample-co");
    expect(uniqueSlug("Sample Co", ["sample-co", "sample-co-2"])).toBe("sample-co-3");
  });

  it("spots look-alike names so nobody adds the same client twice", () => {
    const existing = [{ name: "Sam's Plumbing LLC (fictional)" }, { name: "Bright Roofing (fictional)" }, { name: "Pat Example" }];
    expect(similarClients("Sams Plumbing (fictional)", existing).map((c) => c.name)).toEqual(["Sam's Plumbing LLC (fictional)"]);
    expect(similarClients("bright roofing company (fictional)", existing)).toHaveLength(1);
    expect(similarClients("Bright Dental (fictional)", existing)).toHaveLength(0);
    // Very short names don't count as a match on their own.
    expect(similarClients("Pat", existing)).toHaveLength(0);
    expect(similarClients("LLC", existing)).toHaveLength(0);
  });

  it("reads a monthly amount the way people type it", () => {
    expect(parseMonthly("500")).toBe(500);
    expect(parseMonthly("$1,250.50")).toBe(1250.5);
    expect(parseMonthly("")).toBeNull();
    expect(parseMonthly("abc")).toBeNaN();
    expect(parseMonthly("12.345")).toBeNaN();
    expect(parseMonthly("999999")).toBeNaN();
  });
});

describe("amounts are owner-only (null for everyone else)", () => {
  const seo = { service: "SEO" as const, planId: "p1", name: "Starter", rank: 1, topTier: false };
  const pro = { service: "SEO" as const, planId: "p3", name: "Pro", rank: 3, topTier: true };

  it("labels show the tier, and the amount only when known", () => {
    const c = client({ services: ["SEO", "Ads"], plans: [seo] });
    expect(servicesLabel(c)).toBe("SEO Starter + Google Ads");
    expect(planLabel(c)).toBe("SEO Starter + Google Ads");
    expect(planLabel({ ...c, monthlyUsd: 750 })).toBe("SEO Starter + Google Ads · $750/mo");
    expect(servicesLabel(client({ services: [] }))).toBe("Services not set");
  });

  it("VIP and top tier count as important", () => {
    expect(isImportant(client({}))).toBe(false);
    expect(isImportant(client({ vip: true }))).toBe(true);
    expect(isImportant(client({ plans: [pro] }))).toBe(true);
  });

  it("sorts VIP, then top tier, then tier rank, then amount, without needing amounts", () => {
    const list = [
      client({ id: "a", plans: [seo] }),
      client({ id: "b", plans: [pro] }),
      client({ id: "c", vip: true }),
      client({ id: "d" }),
    ];
    expect([...list].sort(byImportance).map((c) => c.id)).toEqual(["c", "b", "a", "d"]);
    // The owner's view: with no tiers set yet it's the same as before (biggest first).
    const owner = [client({ id: "x", monthlyUsd: 100 }), client({ id: "y", monthlyUsd: 900 })];
    expect([...owner].sort(byImportance).map((c) => c.id)).toEqual(["y", "x"]);
  });

  it("priorities never mention an amount the person can't see", () => {
    const r = scorePriority({ when: "overdue", priority: "normal", dueOn: "2026-11-20" }, { today: "2026-11-24", monthlyUsd: null, important: true });
    expect(r.why.join(" ")).not.toMatch(/\$/);
    expect(r.why).toContain("important client");
    const owner = scorePriority({ when: "overdue", priority: "normal", dueOn: "2026-11-20" }, { today: "2026-11-24", monthlyUsd: 900 });
    expect(owner.why.join(" ")).toMatch(/\$900/);
  });

  it("upsell ideas still show, without the amount", () => {
    const ideas = opportunities(client({ services: ["Ads"], startDate: "2026-01-05" }), "2026-11-24");
    expect(ideas.some((i) => i.startsWith("SEO upsell") && !i.includes("$"))).toBe(true);
  });
});

describe("daily GoHighLevel sync", () => {
  it("runs when the last sync is a day old (or never ran)", () => {
    const now = new Date("2026-11-24T15:00:00Z");
    expect(autoSyncDue(null, now)).toBe(true);
    expect(autoSyncDue("2026-11-23T14:00:00Z", now)).toBe(true);
    expect(autoSyncDue("2026-11-24T09:00:00Z", now)).toBe(false);
    expect(autoSyncDue("not a date", now)).toBe(true);
  });
});

describe("client care guardrails", () => {
  const actions = read("src/app/actions.ts");
  const ds = read("src/lib/data-source.ts");
  const migration = read("supabase/migrations/0025_client_care.sql");

  it("no client read asks for monthly_usd once 0025 is run (it's locked)", () => {
    const cols = ds.slice(ds.indexOf("const CLIENT_COLS"), ds.indexOf("const CARE_PLAN_COLS"));
    expect(cols).not.toMatch(/monthly_usd/);
    // The newest shape (after 0025) reads the care columns and never the amount.
    expect(ds).toMatch(/select\(`\$\{CLIENT_COLS\}, owner_staff_id, vip, backup_staff_id, care_started_on`\)/);
  });

  it("amounts are read only for the owner, from client_money", () => {
    const fn = ds.slice(ds.indexOf("async function readClientMoney"), ds.indexOf("/** Plan tiers (0025)"));
    expect(fn).toMatch(/if \(!isOwner\) return null;/);
    expect(fn).toMatch(/from\("client_money"\)/);
    expect(ds).toMatch(/readClientMoney\(db, clients\.data, clients\.careReady, me\?\.role === "owner"\)/);
  });

  it("only the owner edits tiers, amounts and VIP; owner or manager adds clients", () => {
    const care = actions.slice(actions.indexOf("export async function saveClientCare"), actions.indexOf("export async function saveCarePlan"));
    expect(care).toMatch(/me\.role !== "owner"\) return \{ error/);
    const tier = actions.slice(actions.indexOf("export async function saveCarePlan"), actions.indexOf("export async function setCarePlanArchived"));
    expect(tier).toMatch(/me\.role !== "owner"\) return \{ error/);
    const add = actions.slice(actions.indexOf("async function addClientNow"), actions.indexOf("/** Who owns a client"));
    expect(add).toMatch(/!isLead\(me\.role\)/);
    expect(add).toMatch(/const monthly = isOwner \?/);
    expect(add).toMatch(/const vip = isOwner &&/);
  });

  it("amounts never go into the client history (managers can read it)", () => {
    const care = actions.slice(actions.indexOf("export async function saveClientCare"), actions.indexOf("/** Who owns a client"));
    const calls = [...care.matchAll(/logActivity\([^;]*;/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).not.toMatch(/monthly|usd|amount/i);
  });

  it("the daily sync is read-only, owner-only and skips billing", () => {
    const fn = actions.slice(actions.indexOf("export async function autoSyncGhl"), actions.indexOf("/** Reads from GoHighLevel and saves copies."));
    expect(fn).toMatch(/me\.role !== "owner"/);
    expect(fn).toMatch(/autoSyncDue\(/);
    expect(fn).not.toMatch(/syncBilling/);
    const core = actions.slice(actions.indexOf("async function runGhlSync"), actions.indexOf("// Sales (0020"));
    expect(core).not.toMatch(/cookies\(|getRoster\(|revalidatePath|getCurrentMember/);
  });

  it("0025 locks the amount column, adds RLS, and has two-factor rules on every new table", () => {
    expect(migration).toMatch(/revoke select, insert, update on public\.clients from authenticated;/);
    const grants = migration.match(/grant (select|insert|update) \(([^)]*)\) on public\.clients/g) ?? [];
    expect(grants).toHaveLength(3);
    for (const g of grants) expect(g).not.toMatch(/monthly_usd/);
    for (const t of ["care_plans", "client_plans", "client_money"]) {
      expect(migration).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
      expect(migration).toMatch(new RegExp(`create policy ${t}_requires_2fa on public\\.${t} as restrictive`));
    }
    expect(migration).toMatch(/create policy client_money_owner on public\.client_money for all to authenticated\s+using \(\(select private\.my_role\(\)\) = 'owner'\)/);
    // The undo steps at the end are commented out: nothing is dropped when it runs.
    expect(migration).not.toMatch(/^\s*drop /im);
  });

  it("seeded tiers and new code carry no prices or real names", () => {
    const seed = migration.slice(migration.indexOf("insert into public.care_plans"), migration.indexOf("-- 2. Which tier"));
    expect(seed).not.toMatch(/\$\s?\d/);
    expect(read("src/lib/care.ts")).not.toMatch(/\$\d/);
  });
});
