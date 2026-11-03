// Loads REAL agency data from the private-data/ folder on this Mac.
//
// - private-data/ is ignored by Git (see .gitignore and tests/guardrails.test.ts),
//   so real client names and amounts never reach GitHub.
// - This file uses node:fs, so it can only run on the server. Next.js refuses to
//   bundle it into browser code.
// - The files are treated as untrusted input: every record is checked, and
//   anything malformed is skipped (and counted) instead of shown.
// - If a file is missing (for example in automated tests, or on another computer),
//   callers fall back to the fictional demo data.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RosterClient, Service, SubscriptionStatus, TeamMember, TeamRole } from "@/lib/types";

const DIR = join(process.cwd(), "private-data");

const STATUSES: SubscriptionStatus[] = ["active", "paused", "canceled", "incomplete_expired"];
const SERVICES: Service[] = ["SEO", "Ads", "Website"];
const ROLES: TeamRole[] = ["founder", "client_comms", "client_manager", "seo_developer"];

/** Plain text only: trims, removes control characters, caps the length. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text.length > 0 && text.length <= max ? text : null;
}

function readJson(file: string): unknown {
  const path = join(DIR, file);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null; // unreadable file = treat as missing, never crash the app
  }
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface LoadedRoster {
  clients: RosterClient[];
  skipped: number;
}

/** Real client list, or null when private-data/clients.json is missing or unreadable. */
export function loadPrivateRoster(): LoadedRoster | null {
  return parseRoster(readJson("clients.json"));
}

/** Checks every record in a client file. Exported so tests can feed it bad input. */
export function parseRoster(input: unknown): LoadedRoster | null {
  const raw = input as { clients?: unknown } | null;
  if (!raw || !Array.isArray(raw.clients)) return null;

  const clients: RosterClient[] = [];
  const usedIds = new Set<string>();
  let skipped = 0;

  for (const item of raw.clients as Record<string, unknown>[]) {
    const name = cleanText(item?.name, 80);
    const monthly = item?.monthlyUsd;
    const start = item?.startDate;
    const status = item?.status;
    const valid =
      name !== null &&
      typeof monthly === "number" &&
      Number.isFinite(monthly) &&
      monthly >= 0 &&
      monthly <= 100_000 &&
      typeof start === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(start) &&
      !Number.isNaN(Date.parse(start)) &&
      STATUSES.includes(status as SubscriptionStatus);
    if (!valid) {
      skipped++;
      continue;
    }

    let id = slug(name) || "client";
    for (let n = 2; usedIds.has(id); n++) id = `${slug(name)}-${n}`;
    usedIds.add(id);

    const listedIn = Array.isArray(item.listedIn)
      ? item.listedIn.map((x) => cleanText(x, 20)).filter((x): x is string => x !== null)
      : [];
    const services = Array.isArray(item.services)
      ? (item.services.filter((x) => SERVICES.includes(x as Service)) as Service[])
      : [];

    clients.push({
      id,
      name,
      monthlyUsd: Math.round(monthly * 100) / 100,
      startDate: start,
      status: status as SubscriptionStatus,
      listedIn,
      check: cleanText(item.check, 300) ?? undefined,
      services,
    });
  }

  return { clients, skipped };
}

/** Real team, or null when private-data/team.json is missing or unreadable. */
export function loadPrivateTeam(): TeamMember[] | null {
  const raw = readJson("team.json") as { members?: unknown } | null;
  if (!raw || !Array.isArray(raw.members)) return null;
  const members: TeamMember[] = [];
  for (const item of raw.members as Record<string, unknown>[]) {
    const name = cleanText(item?.name, 40);
    const role = item?.role as TeamRole;
    if (!name || !ROLES.includes(role)) continue;
    const handles = Array.isArray(item.handles)
      ? item.handles.map((h) => cleanText(h, 80)).filter((h): h is string => h !== null).slice(0, 8)
      : [];
    members.push({ id: `tm-${slug(name)}`, name, role, handles });
  }
  return members.length > 0 ? members : null;
}
