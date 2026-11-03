// SAMPLE home-screen data: client-result numbers, prospect follow-ups,
// sample alerts and activity. Alerts and activity calculated from your REAL
// client list are added on top of these in data-source.ts.

import type { MissionControlData } from "@/lib/types";

export const missionControl: MissionControlData = {
  weekLabel: "Week of Nov 2, 2026",
  today: "2026-11-02",
  // SAMPLE until GoHighLevel is connected (Phase 3).
  clientResults: [
    { id: "k_appts", label: "Appointments booked", hint: "Across all clients this week", value: 148, previous: 131, unit: "count", betterWhen: "higher", trend: [112, 118, 125, 121, 131, 148] },
    { id: "k_show", label: "Show rate", hint: "Booked appointments that showed up", value: 80, previous: 83, unit: "percent", betterWhen: "higher", trend: [84, 82, 85, 83, 83, 80] },
    { id: "k_reply", label: "Avg first reply", hint: "New lead → first human reply", value: 26, previous: 31, unit: "minutes", betterWhen: "lower", trend: [41, 38, 35, 33, 31, 26] },
    { id: "k_deals", label: "Deals won", hint: "Sales clients closed this week", value: 37, previous: 30, unit: "count", betterWhen: "higher", trend: [24, 27, 26, 29, 30, 37] },
    { id: "k_lpa", label: "Leads per appointment", hint: "New leads ÷ appointments (lower is better)", value: 3.2, previous: 3.6, unit: "ratio", betterWhen: "lower", trend: [3.9, 3.8, 3.7, 3.7, 3.6, 3.2] },
    { id: "k_apd", label: "Appointments per deal", hint: "Appointments ÷ deals won (lower is better)", value: 4.0, previous: 4.4, unit: "ratio", betterWhen: "lower", trend: [4.7, 4.4, 4.8, 4.2, 4.4, 4.0] },
  ],
  followUps: [
    { id: "fu_1", isSynthetic: true, prospectId: "pr_01", title: "Chase the proposal", due: "2026-10-31", urgency: "red", why: "Sent 4 days ago, no reply · busy season soon" },
    { id: "fu_2", isSynthetic: true, prospectId: "pr_02", title: "Discovery call at 3pm", due: "2026-11-02", urgency: "gold", why: "Grade A · $750–$1.2K/mo potential" },
    { id: "fu_3", isSynthetic: true, prospectId: "pr_03", title: "Send SEO pricing", due: "2026-11-01", urgency: "red", why: "Asked for a price yesterday" },
    { id: "fu_4", isSynthetic: true, prospectId: "pr_04", title: "First reply to website chat", due: "2026-11-02", urgency: "gold", why: "New inbound lead · not contacted yet" },
    { id: "fu_5", isSynthetic: true, prospectId: "pr_05", title: "Send 2 local case studies", due: "2026-11-04", urgency: "normal", why: "Asked before booking a call" },
  ],
  alerts: [
    { id: "al_s1", isSynthetic: true, href: "/work", severity: "critical", title: "Sample: a client website is down", detail: "Urgent work order in progress. Do first." },
    { id: "al_s2", isSynthetic: true, href: "/sales/pr_01", severity: "warning", title: "Sample: proposal going cold", detail: "No reply in 4 days from a Grade A prospect." },
  ],
  activity: [
    { id: "act_s1", isSynthetic: true, href: "/sales/pr_02", kind: "call_booked", title: "Sample: discovery call booked", at: "2026-10-30T15:00:00Z" },
    { id: "act_s2", isSynthetic: true, href: "/sales/pr_01", kind: "proposal_sent", title: "Sample: proposal sent ($500–$750/mo)", at: "2026-10-29T16:00:00Z" },
    { id: "act_s3", isSynthetic: true, href: "/work", kind: "work_done", title: "Sample: blog post published for a client", at: "2026-10-30T12:00:00Z" },
  ],
};
