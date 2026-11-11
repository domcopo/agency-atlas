// Safety guardrails. These scan the app's own files and FAIL the test run if
// anything appears that the project rules forbid: network calls, GoHighLevel
// addresses, write-style requests, secrets, raw-HTML rendering, database writes
// outside the one actions file, or tables without row-level security.
//
// If one of these fails, don't loosen the test — find out why the code changed.
// Passing these checks reduces risk; it does not prove the app is secure.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const scannedFiles = [
  ...walk(join(ROOT, "src")),
  ...walk(join(ROOT, "public")),
  join(ROOT, "next.config.ts"),
].filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|css|json|svg|html|webmanifest)$/.test(f));

const contents = scannedFiles.map((file) => ({
  file: relative(ROOT, file),
  text: readFileSync(file, "utf8"),
}));

/** Returns "file: matched text" for every file that matches any pattern. */
function findMatches(patterns: RegExp[]): string[] {
  const hits: string[] = [];
  for (const { file, text } of contents) {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) hits.push(`${file}: ${m[0]}`);
    }
  }
  return hits;
}

describe("Phase 1 guardrails", () => {
  it("scans a meaningful set of files", () => {
    expect(contents.length).toBeGreaterThan(10);
  });

  // Phase 3: exactly ONE file may contact GoHighLevel or make network calls: the
  // read-only module. It is checked line by line in "GoHighLevel read-only" below.
  const GHL_MODULE = "src/lib/ghl/client.ts";

  it("only the read-only GoHighLevel module references GoHighLevel API hosts", () => {
    const hits = findMatches([/leadconnectorhq\.com/i, /gohighlevel\.com/i, /msgsndr\.com/i]);
    expect(hits.filter((h) => !h.startsWith(`${GHL_MODULE}:`))).toEqual([]);
  });

  it("makes no network calls from app code (except the read-only GoHighLevel module)", () => {
    const hits = findMatches([
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /new\s+WebSocket\s*\(/,
      /new\s+EventSource\s*\(/,
      /sendBeacon/,
      /\baxios\b/,
    ]);
    expect(hits.filter((h) => !h.startsWith(`${GHL_MODULE}:`))).toEqual([]);
  });

  it("contains no write-style HTTP methods", () => {
    expect(findMatches([/method\s*:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/i])).toEqual([]);
  });

  it("contains no secret-looking values", () => {
    expect(
      findMatches([
        /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JSON Web Token
        /\bsk_(live|test)_[A-Za-z0-9]{8,}/, // payment-style secret key
        /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
        /service_role/i, // Supabase admin key name
        /sb_secret_[A-Za-z0-9]/, // Supabase secret (admin) key value
        /\bpit-[0-9a-f]{8}-[0-9a-f]{4}/i, // GoHighLevel private integration token
        /Bearer\s+[A-Za-z0-9._-]{20,}/,
      ]),
    ).toEqual([]);
  });

  it("never exposes secret-named variables to the browser", () => {
    expect(
      findMatches([/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE|PRIVATE|TOKEN|PASSWORD)/]),
    ).toEqual([]);
  });

  it("never renders raw HTML or runs strings as code", () => {
    expect(
      findMatches([/dangerouslySetInnerHTML/, /\.innerHTML\s*=/, /\beval\s*\(/, /new\s+Function\s*\(/]),
    ).toEqual([]);
  });

  it("registers no service worker (nothing cached offline)", () => {
    expect(findMatches([/serviceWorker\.register/])).toEqual([]);
    expect(existsSync(join(ROOT, "public", "sw.js"))).toBe(false);
  });
});

describe("secret files", () => {
  it(".env.example holds variable names only, never values", () => {
    const lines = readFileSync(join(ROOT, ".env.example"), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    for (const line of lines) expect(line, line).toMatch(/^[A-Z0-9_]+=$/);
    // Commented-out examples must also be empty.
    const commented = readFileSync(join(ROOT, ".env.example"), "utf8").match(/^#\s*[A-Z0-9_]+=.+$/gm);
    expect(commented).toBeNull();
  });

  it(".gitignore blocks .env files", () => {
    const gi = readFileSync(join(ROOT, ".gitignore"), "utf8").split("\n");
    expect(gi).toContain(".env");
    expect(gi).toContain(".env.*");
  });

  it("Git ignores local settings files and tracks no .env file except the example", () => {
    // Phase 2: a private .env.local may exist on this Mac (Supabase address + publishable key).
    // It must never be committed. Checks file NAMES only — never opens them.
    expect(() =>
      execFileSync("git", ["check-ignore", "-q", ".env.local"], { cwd: ROOT }),
    ).not.toThrow();
    const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter((f) => /(^|\/)\.env/.test(f) && !f.endsWith(".env.example"));
    expect(tracked).toEqual([]);
  });
});

describe("dependencies", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  it("includes no GoHighLevel SDK or general HTTP library", () => {
    expect(names.filter((n) => /highlevel|leadconnector|^axios$|^got$|^node-fetch$|^ky$/i.test(n))).toEqual([]);
  });

  it("uses only Supabase's two official app libraries, pinned to exact versions", () => {
    expect(names.filter((n) => n.startsWith("@supabase/")).sort()).toEqual(["@supabase/ssr", "@supabase/supabase-js"]);
    for (const n of ["@supabase/ssr", "@supabase/supabase-js"]) {
      expect(pkg.dependencies?.[n], n).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("uses only Anthropic's official SDK for AI (Phase 4), pinned exactly, and no other AI library", () => {
    expect(names.filter((n) => n.startsWith("@anthropic-ai/"))).toEqual(["@anthropic-ai/sdk"]);
    expect(pkg.dependencies?.["@anthropic-ai/sdk"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(names.filter((n) => /^(openai|langchain|@langchain\/.*|ai|@ai-sdk\/.*|llamaindex)$/.test(n))).toEqual([]);
  });
});

describe("real client data stays private", () => {
  const PRIVATE_DIR = join(ROOT, "private-data");

  it(".gitignore blocks the private-data folder", () => {
    const gi = readFileSync(join(ROOT, ".gitignore"), "utf8").split("\n");
    expect(gi).toContain("private-data/");
  });

  it("Git ignores the client file and tracks nothing in private-data", () => {
    // `git check-ignore` exits with an error if the path is NOT ignored.
    expect(() =>
      execFileSync("git", ["check-ignore", "-q", "private-data/clients.json"], { cwd: ROOT }),
    ).not.toThrow();
    const tracked = execFileSync("git", ["ls-files", "private-data"], { cwd: ROOT, encoding: "utf8" });
    expect(tracked.trim()).toBe("");
  });

  it("only the private-data loader and the Wi-Fi guard read private-data/", () => {
    const readers = contents
      .filter(({ text }) => /private-data/.test(text) && /readFileSync|existsSync/.test(text))
      .map(({ file }) => file);
    expect(readers).toEqual(["src/lib/private-data.ts"]);
  });

  it("no real client or team name is copied into app code, docs or tests", () => {
    const file = join(PRIVATE_DIR, "clients.json");
    if (!existsSync(file)) return; // nothing to compare on machines without the private file
    const people = [
      ...(JSON.parse(readFileSync(file, "utf8")) as { clients: { name: string }[] }).clients,
      ...(existsSync(join(PRIVATE_DIR, "team.json"))
        ? (JSON.parse(readFileSync(join(PRIVATE_DIR, "team.json"), "utf8")) as { members: { name: string }[] }).members
        : []),
    ];
    // Check each name as written AND in page-address form ("first-last"), which once slipped past.
    const names = [
      ...new Set(
        people.flatMap((p) => {
          const lower = p.name.toLowerCase().trim();
          const slugged = lower.normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          // Single-word names (e.g. a first name only) are too common to search for safely.
          return lower.includes(" ") ? [lower, slugged] : [];
        }),
      ),
    ];
    const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !/\.(png|jpe?g|ico)$/.test(f))
      .concat(walk(join(ROOT, "src")).map((f) => relative(ROOT, f)));
    const hits: string[] = [];
    for (const f of new Set(tracked)) {
      if (!existsSync(join(ROOT, f))) continue;
      const text = readFileSync(join(ROOT, f), "utf8").toLowerCase();
      for (const n of names) if (text.includes(n)) hits.push(`${f}: ${n}`);
    }
    expect(hits).toEqual([]);
  });
});

describe("database safety (Phase 2)", () => {
  const ACTIONS = "src/app/actions.ts";
  const SERVER = "src/lib/supabase/server.ts";

  it("only the database module reads the Supabase settings", () => {
    const readers = contents.filter(({ text }) => /process\.env\.SUPABASE_/.test(text)).map(({ file }) => file);
    expect(readers).toEqual([SERVER]);
  });

  it("Supabase settings are never exposed to the browser", () => {
    expect(findMatches([/NEXT_PUBLIC_SUPABASE/])).toEqual([]);
  });

  it("the sign-in gate skips exactly one address: the owner's dashboard read", () => {
    const proxy = readFileSync(join(ROOT, "src/proxy.ts"), "utf8");
    // Every address mentioned in the gate, and every early "let it through".
    expect([...proxy.matchAll(/"(\/api\/[^"]*)"/g)].map((m) => m[1])).toEqual(["/api/owner-summary"]);
    expect([...proxy.matchAll(/request\.nextUrl\.pathname\s*(===|==|\.startsWith|\.includes|\.match)/g)].map((m) => m[1])).toEqual(["==="]);
    expect(proxy).toMatch(/if \(request\.nextUrl\.pathname === OWNER_SUMMARY_PATH\) return NextResponse\.next\(\);/);
  });

  it("the sign-in gate requires two-factor (aal2) before any screen", () => {
    const proxy = readFileSync(join(ROOT, "src/proxy.ts"), "utf8");
    expect(proxy).toMatch(/aal\s*===\s*"aal2"/);
    expect(proxy).toMatch(/redirectTo\("\/mfa"/);
  });

  it("every migrated table also has a database-level two-factor rule", () => {
    const sql = readdirSync(join(ROOT, "supabase/migrations"))
      .map((f) => readFileSync(join(ROOT, "supabase/migrations", f), "utf8"))
      .join("\n");
    const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1] ?? "");
    const guarded = new Set([...sql.matchAll(/on public\.(\w+) as restrictive[\s\S]*?'aal2'/g)].map((m) => m[1] ?? ""));
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((t) => !guarded.has(t))).toEqual([]);
  });

  it("database writes happen only in the actions file", () => {
    const writers = contents
      .filter(({ text }) => /\.from\(\s*["'`][a-z_]+["'`]\s*\)\s*\.(insert|update|upsert)\(/.test(text))
      .map(({ file }) => file);
    expect(writers).toEqual([ACTIONS]); // also proves the check really finds writes
  });

  it("the app never deletes database rows, calls database functions, or uses admin APIs", () => {
    expect(findMatches([/\.from\(\s*["'`][a-z_]+["'`]\s*\)\s*\.delete\(/, /auth\.admin/])).toEqual([]);
    // One approved exception (owner summary, 0012): exactly one database function call,
    // in the database module, to the owner's dashboard read. Nothing else.
    const calls = contents.flatMap(({ file, text }) => [...text.matchAll(/\.rpc\(\s*([^,)]*)/g)].map((m) => `${file}: ${m[1]}`));
    expect(calls).toEqual([`${SERVER}: "owner_summary_latest"`]);
  });

  it("every table in the migrations has row-level security, and signed-out users get no grants", () => {
    const dir = join(ROOT, "supabase", "migrations");
    const sql = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    const tables = [...sql.matchAll(/create table (public\.[a-z_]+)/g)].map((m) => m[1] ?? "");
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) {
      expect(new RegExp(`alter table ${t.replace(".", "\\.")}\\s+enable row level security`).test(sql), t).toBe(true);
    }
    // Signed-out callers get no grants, except the ONE approved dashboard read (0012).
    const anonGrants = [...sql.matchAll(/grant [^;]* to [^;]*\banon\b[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, " "));
    expect(anonGrants).toEqual(["grant execute on function public.owner_summary_latest(text) to anon;"]);
  });
});

describe("GoHighLevel read-only (Phase 3)", () => {
  const GHL_MODULE = "src/lib/ghl/client.ts";
  const ghl = readFileSync(join(ROOT, GHL_MODULE), "utf8");

  it("only the GoHighLevel module reads the GHL settings", () => {
    const readers = contents.filter(({ text }) => /process\.env\.GHL_/.test(text)).map(({ file }) => file);
    expect(readers).toEqual([GHL_MODULE]);
  });

  it("GHL settings are never exposed to the browser", () => {
    expect(findMatches([/NEXT_PUBLIC_GHL/])).toEqual([]);
  });

  it("the module makes exactly one network call, and it is a GET", () => {
    expect(ghl.match(/\bfetch\s*\(/g)?.length).toBe(1);
    const methods = [...ghl.matchAll(/method\s*:\s*["'`]([A-Za-z]+)["'`]/g)].map((m) => m[1]);
    expect(methods).toEqual(["GET"]);
    expect(ghl).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/);
    expect(ghl).toMatch(/redirect:\s*"error"/); // never follows a redirect elsewhere
  });

  it("the module talks to one fixed host and only allowlisted read addresses", () => {
    const hosts = [...ghl.matchAll(/https:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]);
    expect(new Set(hosts)).toEqual(new Set(["https://services.leadconnectorhq.com"]));
    const allowed = ghl.slice(ghl.indexOf("const ALLOWED"), ghl.indexOf("];", ghl.indexOf("const ALLOWED")));
    const paths = [...allowed.matchAll(/pattern: \/\^(\\\/[^$]*)\$\//g)].map((m) => (m[1] ?? "").replace(/\\\//g, "/"));
    expect(paths.sort()).toEqual(
      [
        "/calendars/",
        "/calendars/events",
        "/locations/[A-Za-z0-9]+",
        "/opportunities/pipelines",
        "/opportunities/search",
        // Phase 6 (approved): conversation times only
        "/conversations/search",
        "/conversations/[A-Za-z0-9]{6,40}/messages",
        // Billing (0015, approved): invoices and payment transactions, read only
        "/invoices/",
        "/payments/transactions",
      ].sort(),
    );
  });

  it("never reads message text, emails or phone numbers from GoHighLevel (Phase 6: times only)", () => {
    expect(ghl).not.toMatch(/\.(body|email|phone|lastMessageBody|from|to)\b/);
    expect(ghl).not.toMatch(/\[\s*["'`](body|email|phone|lastMessageBody|from|to)["'`]\s*\]/);
  });

  it("no GoHighLevel SDK or write-capable package is installed", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {}).filter((d) => /highlevel|leadconnector|ghl/i.test(d))).toEqual([]);
  });

  it("only server code imports the GoHighLevel module", () => {
    const importers = contents.filter(({ text }) => /from\s+["']@\/lib\/ghl\/client["']/.test(text)).map(({ file }) => file).sort();
    expect(importers).toEqual(["src/app/actions.ts", "src/lib/data-source.ts"]);
    for (const f of importers) expect(readFileSync(join(ROOT, f), "utf8")).not.toMatch(/^["']use client["']/m);
  });
});

describe("AI read-only + budget (Phase 4)", () => {
  const AI_MODULE = "src/lib/ai/client.ts";
  const ai = readFileSync(join(ROOT, AI_MODULE), "utf8");

  it("only the AI module uses Anthropic's SDK or reads the AI key", () => {
    expect(contents.filter(({ text }) => /from\s+["']@anthropic-ai\/sdk["']/.test(text)).map(({ file }) => file)).toEqual([AI_MODULE]);
    expect(contents.filter(({ text }) => /process\.env\.ANTHROPIC_/.test(text)).map(({ file }) => file)).toEqual([AI_MODULE]);
    expect(findMatches([/NEXT_PUBLIC_ANTHROPIC/])).toEqual([]);
  });

  it("the AI gets NO tools, so it can only return text", () => {
    expect(ai).not.toMatch(/\btools\s*:/);
    expect(ai).not.toMatch(/tool_choice|mcp_servers|betaZodTool|toolRunner|tool_runner|computer_|bash_|code_execution|web_fetch|web_search/);
    expect(ai.match(/messages\.create\(/g)?.length).toBe(1); // one place sends requests
    expect(ai).not.toMatch(/\.beta\./); // no beta surfaces (agents, sessions, tools)
  });

  it("requests go to one fixed address, and the budget check comes before sending", () => {
    expect(ai).toMatch(/baseURL:\s*API_BASE/);
    expect(new Set([...ai.matchAll(/https:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]))).toEqual(new Set(["https://api.anthropic.com"]));
    expect(ai.indexOf("worstCaseCost(")).toBeGreaterThan(-1);
    expect(ai.indexOf("worstCaseCost(")).toBeLessThan(ai.indexOf("messages.create("));
    expect(ai).toMatch(/remainingUsd: number;/); // callers must pass what's left
  });

  it("only server code uses the AI module, and every AI call is logged", () => {
    const importers = contents.filter(({ text }) => /from\s+["']@\/lib\/ai\/client["']/.test(text)).map(({ file }) => file).sort();
    expect(importers).toEqual(["src/app/actions.ts", "src/lib/data-source.ts"]);
    for (const f of importers) expect(readFileSync(join(ROOT, f), "utf8")).not.toMatch(/^["']use client["']/m);
    const actions = readFileSync(join(ROOT, "src/app/actions.ts"), "utf8");
    const calls = actions.match(/await askAi\(/g)?.length ?? 0;
    expect(calls).toBeGreaterThan(0);
    expect(actions.match(/await logAiUsage\(/g)?.length).toBe(calls);
  });
});

describe("cancel and quick add (0013)", () => {
  const actions = readFileSync(join(ROOT, "src/app/actions.ts"), "utf8");
  const body = (name: string) => {
    const start = actions.indexOf(`export async function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const next = actions.indexOf("\nexport async function ", start + 10);
    return actions.slice(start, next === -1 ? undefined : next);
  };

  it("quick add never saves the photo or the drafts: its only database write is the cost log", () => {
    const q = body("quickAddWorkOrders");
    expect(q).not.toMatch(/\bdb\.from\(|\.insert\(|\.upsert\(|\.update\(|\.storage\b|writeFile/);
    expect(q).toMatch(/await logAiUsage\(db, "quick_add", result\)/);
    expect(q).toMatch(/MAX_PHOTO_BYTES/); // size checked on the server
    expect(q).toMatch(/imageType\(bytes\)/); // real file type checked from its bytes
  });

  it("cancel and restore are owner-only in the app too (the database enforces it either way)", () => {
    const u = body("updateAction");
    expect(u).toMatch(/op === "cancel"\) \{\s*\/\/[^\n]*\n\s*if \(me\.role !== "owner"/);
    expect(u).toMatch(/op === "restore"\) \{\s*if \(me\.role !== "owner"/);
    // The status picker can't be used to cancel.
    expect(actions).toMatch(/const STATUSES = \["open", "in_progress", "waiting", "blocked", "review", "done"\] as const;/);
  });

  it("there are still no deletes anywhere in the app", () => {
    expect(findMatches([/\.delete\(\)/])).toEqual([]);
  });
});

describe("Kit (0014)", () => {
  it("only server actions write Kit, and Kit pages render text safely", () => {
    const writers = contents.filter(({ text }) => /from\(["']kit_(docs|tools|doc_versions)["']\)\s*\.(insert|update|upsert)/.test(text.replace(/\s+/g, " "))).map(({ file }) => file);
    expect(writers.every((f) => f === "src/app/actions.ts")).toBe(true);
    // Nobody writes page history: the database does.
    expect(findMatches([/kit_doc_versions["']\)\s*\.(insert|update|upsert)/])).toEqual([]);
    const text = readFileSync(join(ROOT, "src/components/kit/KitText.tsx"), "utf8");
    expect(text).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
  });
});

describe("billing (0015): read-only, owner-only, minimum fields", () => {
  const ghl = readFileSync(join(ROOT, "src/lib/ghl/client.ts"), "utf8");
  const actions = readFileSync(join(ROOT, "src/app/actions.ts"), "utf8");
  const allowed = ghl.slice(ghl.indexOf("const ALLOWED"), ghl.indexOf("];", ghl.indexOf("const ALLOWED")));

  it("only the two billing addresses use the billing token, and the billing token is used for nothing else", () => {
    const billingRules = allowed.split("\n").filter((l) => /token: "billing"/.test(l));
    expect(billingRules.map((l) => l.match(/pattern: \/\^(.*)\$\//)?.[1]?.replace(/\\\//g, "/")).sort()).toEqual(["/invoices/", "/payments/transactions"]);
    // The billing token is read in exactly one place, and get() picks it only for billing rules.
    expect(ghl.match(/GHL_BILLING_READONLY_TOKEN\?\.trim\(\)/g)?.length).toBe(1);
    expect(ghl).toMatch(/rule\.token === "billing" \? billingSettings\(\) : settings\(\)/);
    expect(findMatches([/NEXT_PUBLIC_[A-Z_]*BILLING/])).toEqual([]);
  });

  it("never reads card, bank, email, phone, address, notes or line items from GoHighLevel", () => {
    const billingCode = ghl.slice(ghl.indexOf("// Billing (0015): invoices and payments"));
    expect(billingCode.length).toBeGreaterThan(500);
    expect(billingCode).not.toMatch(
      /\.(paymentMethod|card|last4|brand|bank|contactEmail|email|phone|phoneNo|address|businessDetails|invoiceItems|items|notes|termsNotes|chargeSnapshot|ipAddress|title|invoiceNumber)\b/,
    );
    // From the contact block, only the ID and the name are read.
    const fromContact = [...billingCode.matchAll(/who\.([A-Za-z]+)/g)].map((m) => m[1]);
    expect(new Set(fromContact)).toEqual(new Set(["id", "name"]));
  });

  it("never voids, sends, charges, refunds or reminds", () => {
    expect(findMatches([/\b(voidInvoice|sendInvoice|recordPayment|createInvoice|chargeCustomer|refundPayment|sendReminder)\b/i])).toEqual([]);
    expect(allowed).not.toMatch(/void|send|record-payment|schedule|refund|charge/i);
  });

  it("only the owner-checked actions write billing, and nothing deletes it", () => {
    const writers = contents
      .filter(({ text }) => /from\(["']billing_(records|contact_matches|syncs)["']\)\s*\.(insert|update|upsert|delete)/.test(text.replace(/\s+/g, " ")))
      .map(({ file }) => file);
    expect([...new Set(writers)]).toEqual(["src/app/actions.ts"]);
    expect(findMatches([/billing_[a-z_]+["']\)\s*\.delete\(/])).toEqual([]);
    for (const fn of ["syncBilling", "matchBillingContact"]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}(`));
      expect(body.slice(0, 400)).toMatch(/me\.role !== "owner"/);
    }
  });

  it("billing history lines never carry money", () => {
    const body = actions.slice(actions.indexOf("export async function syncBilling("), actions.indexOf("export async function matchBillingContact("));
    const lines = [...body.matchAll(/kind: "billing_sync", summary: `([^`]*)`/g)].map((m) => m[1] ?? "");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const l of lines) expect(l).not.toMatch(/\$\{[^}]*(amount|usd|cents|total)|\$\d/i);
  });

  it("screens read billing only through data-source, which returns it to the owner only", () => {
    const readers = contents.filter(({ text }) => /from\(["']billing_/.test(text)).map(({ file }) => file).sort();
    expect(readers).toEqual(["src/app/actions.ts", "src/lib/data-source.ts"]);
    const ds = readFileSync(join(ROOT, "src/lib/data-source.ts"), "utf8");
    const getter = ds.slice(ds.indexOf("export const getBilling"));
    expect(getter.slice(0, 300)).toMatch(/me\.role !== "owner"\) return null/);
  });
});

describe("owner summary (0012): one read-only route for the owner's dashboard", () => {
  const ROUTE = "src/app/api/owner-summary/route.ts";
  const ACCESS = "src/lib/owner-summary-access.ts";
  const route = readFileSync(join(ROOT, ROUTE), "utf8");

  it("is the only API route, and it only answers GET", () => {
    const routes = contents.filter(({ file }) => /^src\/app\/.*route\.(ts|js)$/.test(file)).map(({ file }) => file);
    expect(routes).toEqual([ROUTE]);
    const exported = [...route.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_]+)/g)].map((m) => m[1]);
    expect(exported.sort()).toEqual(["GET", "dynamic"]);
  });

  it("triggers nothing: no GoHighLevel, no AI, no saving", () => {
    const imports = [...route.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(["@/lib/owner-summary-access", "@/lib/supabase/server"]);
    expect(route).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|syncFromGhl|askAi|revalidatePath/);
  });

  it("never caches and always answers with no-store", () => {
    expect(route).toMatch(/"Cache-Control": "no-store"/);
    expect(route).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("only the key-check module reads the key fingerprint, and never for the browser", () => {
    const readers = contents.filter(({ text }) => /process\.env\.OWNER_SUMMARY_/.test(text)).map(({ file }) => file);
    expect(readers).toEqual([ACCESS]);
    expect(findMatches([/NEXT_PUBLIC_OWNER_SUMMARY/])).toEqual([]);
    const access = readFileSync(join(ROOT, ACCESS), "utf8");
    expect(access).toMatch(/timingSafeEqual/);
    expect(access).not.toMatch(/console\./); // the key is never logged
  });

  it("the summary itself is built from totals: the builder never reads notes, messages or titles", () => {
    const builder = readFileSync(join(ROOT, "src/lib/owner-summary.ts"), "utf8");
    expect(builder).not.toMatch(/\.(notes|followUp|check|steps|sourceNote|sourceLink|reviewNote|blockedReason|why|title)\b/);
  });
});

describe("preview as developer: look only, narrows, never grants", () => {
  const actions = readFileSync(join(ROOT, "src/app/actions.ts"), "utf8");

  it("every save refuses while previewing (except signing in/out and starting/stopping the preview)", () => {
    const EXEMPT = ["signIn", "signOut", "startPreview", "stopPreview"];
    const names = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);
    expect(names.length).toBeGreaterThan(30);
    for (const name of names) {
      if (EXEMPT.includes(name)) continue;
      const start = actions.indexOf(`export async function ${name}`);
      const body = actions.slice(start, start + 600);
      const open = body.indexOf("{\n");
      // the first statement of the body is the lock
      expect(body.slice(open, open + 40), name).toMatch(/^\{\n\s+await notWhilePreviewing\(\);/);
    }
  });

  it("only the owner or a manager can start a preview, for a real team member, with a short-lived httpOnly cookie", () => {
    const start = actions.slice(actions.indexOf("export async function startPreview"), actions.indexOf("export async function stopPreview"));
    expect(start).toMatch(/canPreview\(me\.role\)/);
    expect(start).toMatch(/previewTarget\(/);
    expect(start).toMatch(/members\.some\(/);
    expect(start).toMatch(/COOKIE_OPTIONS/);
    expect(start).toMatch(/maxAge: PREVIEW_MINUTES \* 60/);
    const opts = readFileSync(join(ROOT, "src/lib/supabase/server.ts"), "utf8");
    expect(opts).toMatch(/COOKIE_OPTIONS = \{ httpOnly: true/);
  });

  it("the preview is re-checked on every request (owner/manager + real person), and signing out ends it", () => {
    const ds = readFileSync(join(ROOT, "src/lib/data-source.ts"), "utf8");
    const getter = ds.slice(ds.indexOf("export const getPreview"), ds.indexOf("export interface DeveloperViewer"));
    expect(getter).toMatch(/canPreview\(me\.role\)/);
    expect(getter).toMatch(/members\.find\(/);
    expect(actions.slice(actions.indexOf("export async function signOut"), actions.indexOf("export async function signOut") + 200)).toMatch(/cookies\(\)\)\.delete\(PREVIEW_COOKIE\)/);
  });

  it("while previewing, only Home, Work and Kit open (proxy), and the preview cookie is never public", () => {
    const proxy = readFileSync(join(ROOT, "src/proxy.ts"), "utf8");
    expect(proxy).toMatch(/request\.cookies\.has\(PREVIEW_COOKIE\) && !previewAllows\(path\)\) return redirectTo\("\/"/);
    expect(findMatches([/NEXT_PUBLIC_[A-Z_]*PREVIEW/])).toEqual([]);
  });

  it("developer screens never read billing, revenue or manager-only data", () => {
    const comp = readFileSync(join(ROOT, "src/components/cards/DeveloperWork.tsx"), "utf8");
    expect(comp).not.toMatch(/getBilling|monthlyUsd|data-source/);
    const ds = readFileSync(join(ROOT, "src/lib/data-source.ts"), "utf8");
    const work = ds.slice(ds.indexOf("export const getDeveloperWork"), ds.indexOf("export const getStepsReady"));
    expect(work).not.toMatch(/getBilling|getRoster|monthly/);
    expect(work).toMatch(/developerWorkScope\(/);
    const ops = readFileSync(join(ROOT, "src/lib/ops.ts"), "utf8");
    const scope = ops.slice(ops.indexOf("export function developerWorkScope"), ops.indexOf("// The developer's work screen"));
    expect(scope).not.toMatch(/monthlyUsd|leadGhlId: a\.|cancelNote|canceledAt/);
  });

  it("step ticks are saved only by toggleStep (checked by the database too)", () => {
    const writers = contents.filter(({ text }) => /steps_done/.test(text) && /\.update\(/.test(text)).map(({ file }) => file);
    expect(writers).toEqual(["src/app/actions.ts"]);
    expect([...actions.matchAll(/update\(\{ steps_done/g)]).toHaveLength(1);
  });
});

describe("Home by job: arranges only, never widens", () => {
  const homeDir = join(ROOT, "src/components/home");
  const files = readdirSync(homeDir).map((f) => ({ f, text: readFileSync(join(homeDir, f), "utf8") }));

  it("layouts get their data from the Home page (data-source), never GoHighLevel, the AI or billing", () => {
    for (const { f, text } of files) {
      expect(text, f).not.toMatch(/@\/lib\/ghl|@\/lib\/ai|@\/lib\/data-source|@\/lib\/billing|getBilling|billing/i);
    }
    const rules = readFileSync(join(ROOT, "src/lib/home-layouts.ts"), "utf8");
    expect(rules).not.toMatch(/@\/lib\/ghl|@\/lib\/ai|data-source|billing|supabase/i);
  });

  it("the owner-only Billing card stays on the Everything layout", () => {
    const home = readFileSync(join(ROOT, "src/app/(app)/page.tsx"), "utf8");
    const layoutBranch = home.slice(home.indexOf("const homeLayout = await getHomeLayout()"), home.indexOf('<PageHeader title="Mission Control"'));
    expect(layoutBranch).toMatch(/homeLayout\.layout !== "everything"/);
    expect(layoutBranch).not.toMatch(/billing/i);
  });

  it("the saved choice is one of four names, in an httpOnly cookie, owner/managers only", () => {
    const actions = readFileSync(join(ROOT, "src/app/actions.ts"), "utf8");
    const fn = actions.slice(actions.indexOf("export async function setHomeLayout"), actions.indexOf("export async function signOut"));
    expect(fn).toMatch(/await notWhilePreviewing\(\)/);
    expect(fn).toMatch(/me\.role !== "owner" && me\.role !== "manager"/);
    expect(fn).toMatch(/asHomeLayout\(/);
    expect(fn).toMatch(/COOKIE_OPTIONS/);
    const ds = readFileSync(join(ROOT, "src/lib/data-source.ts"), "utf8");
    const getter = ds.slice(ds.indexOf("export const getHomeLayout"), ds.indexOf("export const getUpcomingAppointments"));
    expect(getter).toMatch(/!me \|\| \(me\.role !== "owner" && me\.role !== "manager"\)\) return null/);
  });

  it("appointments are read as times, calendar names and status only", () => {
    const ds = readFileSync(join(ROOT, "src/lib/data-source.ts"), "utf8");
    const fn = ds.slice(ds.indexOf("export const getUpcomingAppointments"), ds.indexOf("/** Step tick boxes"));
    expect(fn).toMatch(/select\("starts_at, calendar_name, status"\)/);
  });
});

describe("Work Orders phase 1 (0017): who may do what, no GoHighLevel", () => {
  const actions = readFileSync(join(ROOT, "src/app/actions.ts"), "utf8");
  const fn = (name: string) => {
    const start = actions.indexOf(`export async function ${name}`);
    const next = actions.indexOf("export async function", start + 10);
    return actions.slice(start, next === -1 ? undefined : next);
  };

  it("archive is owner only; start date/links and closing a request are owner/manager; asking is developer only", () => {
    expect(fn("archiveWorkOrder")).toMatch(/me\.role !== "owner"\) return;/);
    expect(fn("saveWorkOrderInfo")).toMatch(/me\.role !== "owner" && me\.role !== "manager"/);
    expect(fn("closeReassignRequest")).toMatch(/me\.role !== "owner" && me\.role !== "manager"/);
    expect(fn("requestReassignment")).toMatch(/me\.role !== "developer"/);
  });

  it("comments never carry a typed author (the database fills in who wrote it) and refuse contact details first", () => {
    const c = fn("addWorkOrderComment");
    expect(c).toMatch(/insert\(\{ action_id: id, body: raw \}\)/);
    expect(c.indexOf("contactDetailsIn(")).toBeLessThan(c.indexOf(".insert("));
    expect(fn("createWorkOrder")).toMatch(/contactDetailsIn\(/);
  });

  it("history and notices are never written by the app", () => {
    expect(findMatches([/from\("work_order_history"\)\.(insert|update|upsert)/, /from\("notifications"\)\.(insert|upsert)/])).toEqual([]);
  });

  it("work order screens and rules never touch GoHighLevel or the AI", () => {
    for (const f of ["src/lib/work-orders.ts", "src/components/cards/WorkOrderBoard.tsx", "src/components/forms/WorkOrderDetailForms.tsx", "src/app/(app)/work/orders/[id]/page.tsx", "src/components/shell/WorkOrdersButton.tsx"]) {
      const text = readFileSync(join(ROOT, f), "utf8");
      expect(text, f).not.toMatch(/@\/lib\/ghl|@\/lib\/ai|askAi|getBilling/);
    }
  });
});
