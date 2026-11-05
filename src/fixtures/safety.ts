// Status for the Data Safety screen. This describes the app's real current
// state: no outside service is connected and nothing can write to GoHighLevel.

import type { SafetyStatus } from "@/lib/types";

export const safetyStatus: SafetyStatus = {
  dataMode: "mock",
  connections: [
    {
      id: "conn_supabase",
      name: "Supabase (development)",
      status: "not_connected",
      scopes: [],
      plannedPhase: 2,
      note: "A brand-new project kept apart from your other databases, with sign-in and access rules, plus a local test copy for break-in tests.",
    },
    {
      id: "conn_ghl_api",
      name: "GoHighLevel API",
      status: "not_connected",
      scopes: [],
      plannedPhase: 3,
      note: "The agency's own sub-account. Pipeline and appointment times only, .readonly scopes, GET requests only.",
    },
    {
      id: "conn_ghl_webhooks",
      name: "GoHighLevel webhooks",
      status: "not_connected",
      scopes: [],
      plannedPhase: 4,
      note: "Signature-verified, test location only, metadata logging only.",
    },
  ],
  ghlWriteTargets: [],
  retention: [
    { dataClass: "Message bodies", keepFor: "Not collected (metadata first)", status: "planned" },
    { dataClass: "Raw webhook payloads", keepFor: "7 days, then deleted", status: "planned" },
    { dataClass: "Call transcripts", keepFor: "Not collected until consent review", status: "planned" },
    { dataClass: "Audit logs", keepFor: "1 year", status: "planned" },
  ],
  checklist: [
    { label: "Mock-data prototype with DEMO labels", done: true, phase: 1 },
    { label: "Guardrail tests: no network, no GHL, no secrets", done: true, phase: 1 },
    { label: "Claude Code deny rules for secret files", done: true, phase: 1 },
    { label: "Real client list kept in a Git-ignored private file, with a leak test", done: true, phase: 1 },
    { label: "Team sign-in, public sign-ups turned off", done: true, phase: 2 },
    { label: "Database security rules, break-in tested on a local copy", done: true, phase: 2 },
    { label: "Real client list moved into the database; private file removed from this Mac", done: true, phase: 2 },
    { label: "Two-factor sign-in (MFA) for staff", done: false, phase: 2 },
    { label: "Audit log of who viewed what", done: false, phase: 2 },
    { label: "GoHighLevel read-only module: GET only, allowlisted addresses, tested", done: true, phase: 3 },
    { label: "First read-only sync from the agency sub-account", done: false, phase: 3 },
    { label: "AI: no tools, names coded, every request priced and logged, hard budget stop", done: true, phase: 4 },
    { label: "Webhook signature verification + dedupe", done: false, phase: 4 },
    { label: "Client consent + retention choices recorded", done: false, phase: 5 },
    { label: "Internal kill switch (stops imports, never touches GHL)", done: false, phase: 5 },
  ],
};
