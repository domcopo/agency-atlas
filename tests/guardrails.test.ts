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

  it("never references GoHighLevel API hosts", () => {
    expect(
      findMatches([/leadconnectorhq\.com/i, /gohighlevel\.com/i, /msgsndr\.com/i]),
    ).toEqual([]);
  });

  it("makes no network calls from app code", () => {
    expect(
      findMatches([
        /\bfetch\s*\(/,
        /XMLHttpRequest/,
        /new\s+WebSocket\s*\(/,
        /new\s+EventSource\s*\(/,
        /sendBeacon/,
        /\baxios\b/,
      ]),
    ).toEqual([]);
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
