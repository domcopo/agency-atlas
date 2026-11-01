// Phase 1 safety guardrails. These scan the app's own files and FAIL the test
// run if anything appears that Phase 1 forbids: network calls, GoHighLevel
// addresses, write-style requests, secrets, or raw-HTML rendering.
//
// If one of these fails, don't loosen the test — find out why the code changed.
// Passing these checks reduces risk; it does not prove the app is secure.

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

  it("has no real .env files in the project during Phase 1", () => {
    // Lists file NAMES only — never opens them.
    const envFiles = readdirSync(ROOT).filter((n) => n.startsWith(".env") && n !== ".env.example");
    expect(envFiles).toEqual([]);
  });
});

describe("dependencies", () => {
  it("includes no GoHighLevel SDK, database client or HTTP library in Phase 1", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const forbidden = names.filter((n) =>
      /highlevel|leadconnector|^@supabase\/|^axios$|^got$|^node-fetch$/i.test(n),
    );
    expect(forbidden).toEqual([]);
  });
});
