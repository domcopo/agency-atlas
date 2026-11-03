// Work order rules (from your Developer Daily Workflow chart) plus SAMPLE work orders.
//
// The rules are your real process. The work orders and workloads are fictional:
// they use "Sample client" names and "Developer (sample)" names so no made-up
// numbers are ever attached to a real client or a real team member.
// Real work orders arrive later from GoHighLevel's queue (read-only).

import type { DeveloperLoad, WorkOrder, WorkPriority } from "@/lib/types";

export const workRules = {
  seoHoursPerClient: 10,
  maxSeoClientsPerDeveloper: 15,
  bonusAfterSuccessfulClients: 10,
  bonusPerClientUsd: 15,
  seoShare: 80,
  miscShare: 20,
  dailyOrder: [
    { step: "Start your day", detail: "Check the central queue: new work orders, urgent items, client messages." },
    { step: "Work orders first", detail: "Handle every assigned work order. Urgent first. Touch every one daily." },
    { step: "SEO after", detail: "Then work on assigned SEO clients: optimizations, content, simple monthly reports." },
    { step: "Stay active", detail: "Check the queue all day. Client messages are drafted, then approved before sending." },
  ],
  escalation: [
    { topic: "Work orders, texts, general questions", to: "client_comms" },
    { topic: "Client calls, complex issues, escalations", to: "client_manager" },
    { topic: "High-risk issues, cancellations, upsells, final decisions", to: "founder" },
  ],
} as const;

export const priorityInfo: Record<WorkPriority, { label: string; meaning: string }> = {
  urgent: { label: "Urgent", meaning: "Critical issues, down websites, client impacting. Do first." },
  high: { label: "High", meaning: "Time-sensitive requests. Do next." },
  normal: { label: "Normal", meaning: "Standard requests and tweaks. Do after high." },
  low: { label: "Low", meaning: "Non-urgent tasks. Do when available." },
};

/** Fictional developers for the sample workload. */
export const sampleDevelopers = [
  { id: "dev_a", name: "Developer A (sample)" },
  { id: "dev_b", name: "Developer B (sample)" },
  { id: "dev_c", name: "Developer C (sample)" },
  { id: "dev_d", name: "Developer D (sample)" },
];

export const developerLoads: DeveloperLoad[] = [
  { memberId: "dev_a", isSynthetic: true, seoClients: 14, successfulThisMonth: 11, hoursLogged: 128 },
  { memberId: "dev_b", isSynthetic: true, seoClients: 9, successfulThisMonth: 7, hoursLogged: 84 },
  { memberId: "dev_c", isSynthetic: true, seoClients: 15, successfulThisMonth: 12, hoursLogged: 146 },
  { memberId: "dev_d", isSynthetic: true, seoClients: 1, successfulThisMonth: 0, hoursLogged: 22 },
];

export const workOrders: WorkOrder[] = [
  {
    id: "wo_01", isSynthetic: true, clientLabel: "Sample client: Painting co.", title: "Website is down: restore and check hosting",
    service: "Website", priority: "urgent", status: "in_progress", assignee: "dev_a", requestedByClient: true,
    createdAt: "2026-11-02", due: "2026-11-02", lastTouched: "2026-11-02",
    checklist: [{ label: "Confirm outage", done: true }, { label: "Restore from backup", done: false }, { label: "Tell client manager it's fixed", done: false }],
  },
  {
    id: "wo_02", isSynthetic: true, clientLabel: "Sample client: Landscaping", title: "Swap homepage hero photos",
    service: "Website", priority: "normal", status: "todo", assignee: "dev_b", requestedByClient: true,
    createdAt: "2026-10-30", due: "2026-11-03", lastTouched: "2026-10-30",
    checklist: [{ label: "Get new photos from client", done: false }, { label: "Compress and upload", done: false }],
  },
  {
    id: "wo_03", isSynthetic: true, clientLabel: "Sample client: Med spa", title: "Launch November promo ads",
    service: "Ads", priority: "high", status: "waiting_on_client", assignee: "dev_c", requestedByClient: true,
    createdAt: "2026-10-28", due: "2026-11-01", lastTouched: "2026-10-31",
    checklist: [{ label: "Draft ad copy", done: true }, { label: "Client approves offer", done: false }, { label: "Launch campaign", done: false }],
  },
  {
    id: "wo_04", isSynthetic: true, clientLabel: "Sample client: Auto shop", title: "Monthly SEO report",
    service: "SEO", priority: "normal", status: "review", assignee: "dev_a", requestedByClient: false,
    createdAt: "2026-10-27", due: "2026-11-02", lastTouched: "2026-11-01",
    checklist: [{ label: "Pull rankings", done: true }, { label: "Write summary", done: true }, { label: "Manager approves before sending", done: false }],
  },
  {
    id: "wo_05", isSynthetic: true, clientLabel: "Sample client: Roofing", title: "Fix broken contact form",
    service: "Website", priority: "high", status: "todo", assignee: "dev_d", requestedByClient: true,
    createdAt: "2026-10-29", due: "2026-10-31", lastTouched: "2026-10-29",
    checklist: [{ label: "Reproduce the bug", done: false }, { label: "Fix and test a submission", done: false }],
  },
  {
    id: "wo_06", isSynthetic: true, clientLabel: "Sample client: Dentist", title: "Add 3 location pages",
    service: "SEO", priority: "normal", status: "in_progress", assignee: "dev_c", requestedByClient: false,
    createdAt: "2026-10-25", due: "2026-11-05", lastTouched: "2026-11-01",
    checklist: [{ label: "Research keywords", done: true }, { label: "Write pages", done: false }, { label: "Publish and link", done: false }],
  },
  {
    id: "wo_07", isSynthetic: true, clientLabel: "Sample client: Cleaning co.", title: "Update business hours everywhere",
    service: "Support", priority: "low", status: "todo", assignee: "dev_b", requestedByClient: true,
    createdAt: "2026-10-31", due: "2026-11-07", lastTouched: "2026-10-31",
    checklist: [{ label: "Website", done: false }, { label: "Google Business Profile", done: false }],
  },
  {
    id: "wo_08", isSynthetic: true, clientLabel: "Sample client: Gym", title: "Fix tracking on ad landing page",
    service: "Ads", priority: "high", status: "in_progress", assignee: "dev_b", requestedByClient: false,
    createdAt: "2026-10-30", due: "2026-11-02", lastTouched: "2026-10-30",
    checklist: [{ label: "Check pixel", done: true }, { label: "Test a conversion", done: false }],
  },
  {
    id: "wo_09", isSynthetic: true, clientLabel: "Sample client: Painting co.", title: "Blog post: fall exterior painting tips",
    service: "SEO", priority: "low", status: "done", assignee: "dev_a", requestedByClient: false,
    createdAt: "2026-10-20", due: "2026-10-30", lastTouched: "2026-10-30",
    checklist: [{ label: "Draft", done: true }, { label: "Publish", done: true }],
  },
  {
    id: "wo_10", isSynthetic: true, clientLabel: "Sample client: Med spa", title: "New landing page for Botox special",
    service: "Website", priority: "normal", status: "todo", assignee: "dev_d", requestedByClient: true,
    createdAt: "2026-11-01", due: "2026-11-06", lastTouched: "2026-11-01",
    checklist: [{ label: "Wireframe", done: false }, { label: "Build", done: false }, { label: "Client approves", done: false }],
  },
];
