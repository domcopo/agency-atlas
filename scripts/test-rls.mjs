// Break-in tests for the database security rules, run against a THROWAWAY local
// Postgres in Docker. Never touches your real Supabase project.
//
//   npm run test:rls
//
// Steps: start a fresh container → add the Supabase stand-ins → apply our
// migration → run the break-in tests → always delete the container.

import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const IMAGE = process.env.RLS_TEST_IMAGE ?? "postgres:17.6-alpine"; // official Docker image, same major version as Supabase
const NAME = `atlas-rls-test-${randomBytes(4).toString("hex")}`;
const root = process.cwd();

function docker(args, input) {
  const r = spawnSync("docker", args, { input, encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function psql(sql, label) {
  const r = docker(["exec", "-i", NAME, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-X"], sql);
  const lines = r.out.split("\n").filter((l) => /ok:|FAILED|ERROR|PASSED/.test(l));
  for (const l of lines) console.log(`  ${l.replace(/^.*?(ok:|FAILED|ERROR)/, "$1").trim()}`);
  if (!r.ok) throw new Error(`${label} failed:\n${r.out.split("\n").slice(-6).join("\n")}`);
}

let failed = false;
try {
  // No ports are opened: tests talk to the database from inside the container.
  execFileSync("docker", ["run", "-d", "--rm", "--name", NAME, "-e", `POSTGRES_PASSWORD=${randomBytes(12).toString("hex")}`, IMAGE], { stdio: "ignore" });
  // Postgres restarts once during first-time setup; wait for that to finish.
  for (let i = 0; i < 120; i++) {
    const logs = docker(["logs", NAME]).out;
    if (logs.includes("init process complete") && docker(["exec", NAME, "pg_isready", "-U", "postgres", "-q"]).ok) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log("Local test database is up.");

  psql(readFileSync(join(root, "supabase/tests/00_supabase_shim.sql"), "utf8"), "Supabase stand-ins");
  // RLS_TEST_MIGRATIONS lets us point at a deliberately broken copy to prove the tests catch it.
  const migrations = process.env.RLS_TEST_MIGRATIONS ?? join(root, "supabase/migrations");
  for (const f of readdirSync(migrations).sort()) {
    console.log(`Applying ${f}`);
    psql(readFileSync(join(migrations, f), "utf8"), f);
  }
  console.log("Running break-in tests:");
  psql(readFileSync(join(root, "supabase/tests/10_rls_break_in.sql"), "utf8"), "Break-in tests");
} catch (err) {
  failed = true;
  console.error(`\n✗ ${err.message}`);
} finally {
  docker(["rm", "-f", NAME]);
  console.log("Test database deleted.");
}
process.exit(failed ? 1 : 0);
