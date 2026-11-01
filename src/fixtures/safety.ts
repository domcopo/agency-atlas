// Phase 1 status for the Data Safety screen. This describes the app's real
// current state: nothing is connected and nothing can write to GoHighLevel.

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
      note: "Separate dev project with sign-in and per-client access rules.",
    },
    {
      id: "conn_ghl_api",
      name: "GoHighLevel API",
      status: "not_connected",
      scopes: [],
      plannedPhase: 3,
      note: "One test sub-account, .readonly scopes only, one GET request first.",
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
    { label: "Sign-in with MFA for staff", done: false, phase: 2 },
    { label: "Per-client row-level security, tested", done: false, phase: 2 },
    { label: "Audit log of who viewed what", done: false, phase: 2 },
    { label: "One read-only GET to a test sub-account", done: false, phase: 3 },
    { label: "Webhook signature verification + dedupe", done: false, phase: 4 },
    { label: "Client consent + retention choices recorded", done: false, phase: 5 },
    { label: "Internal kill switch (stops imports, never touches GHL)", done: false, phase: 5 },
  ],
};
