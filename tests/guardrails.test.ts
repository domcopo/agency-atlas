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
    expect(findMatches([/\.from\(\s*["'`][a-z_]+["'`]\s*\)\s*\.delete\(/, /\.rpc\(/, /auth\.admin/])).toEqual([]);
  });

  it("every table in the migrations has row-level security, and signed-out users get no grants", () => {
    const dir = join(ROOT, "supabase", "migrations");
    const sql = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    const tables = [...sql.matchAll(/create table (public\.[a-z_]+)/g)].map((m) => m[1] ?? "");
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) {
      expect(new RegExp(`alter table ${t.replace(".", "\\.")}\\s+enable row level security`).test(sql), t).toBe(true);
    }
    expect(/grant [^;]* to [^;]*\banon\b/i.test(sql)).toBe(false);
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
