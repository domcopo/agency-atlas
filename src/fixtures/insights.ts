// SYNTHETIC DATA — these "insights" were written by hand for the demo.
// No AI produced them and they are not analysis of real data.

import type { Insight } from "@/lib/types";

export const insights: Insight[] = [
  {
    id: "ins_1",
    isSynthetic: true,
    generatedBy: "mock_ai",
    title: "Far-ahead bookings no-show more often",
    observation:
      "At Brightline, appointments booked more than 10 days ahead account for most recent no-shows.",
    evidence: [
      { label: "Brightline Dental (client)", recordType: "client", recordId: "cli_brightline" },
      { label: "Dex #001 signals", recordType: "business", recordId: "biz_001" },
    ],
    confidence: "medium",
    caveats: ["Six weeks of data only", "Staffing changes happened at the same time"],
    suggestedNextStep: "Compare no-show rate before and after the second-reminder test.",
    reviewStatus: "unreviewed",
    createdAt: "2026-10-28",
  },
  {
    id: "ins_2",
    isSynthetic: true,
    generatedBy: "mock_ai",
    title: "Speed-to-lead shows up across strong performers",
    observation:
      "Reply speed is a theme in four Dex records. Summit, the healthiest client, replies in about 11 minutes; Copper Kettle, slower on weekends, is losing inquiries.",
    evidence: [
      { label: "Summit Roof (client)", recordType: "client", recordId: "cli_summit" },
      { label: "Dex #006 Harbor & Pine", recordType: "business", recordId: "biz_006" },
      { label: "Dex #005 Fieldstone", recordType: "business", recordId: "biz_005" },
    ],
    confidence: "low",
    caveats: [
      "Correlation, not proof of cause",
      "Non-client signals are public claims, not measured reply times",
    ],
    suggestedNextStep: "Test a weekend reply rotation with Copper Kettle and measure tastings booked.",
    reviewStatus: "unreviewed",
    createdAt: "2026-10-29",
  },
  {
    id: "ins_3",
    isSynthetic: true,
    generatedBy: "mock_ai",
    title: "Memberships appear in three different industries",
    observation:
      "Fitness, HVAC and auto detailing businesses in the Dex all lean on recurring memberships.",
    evidence: [
      { label: "Dex #004 Lumen Yoga", recordType: "business", recordId: "biz_004" },
      { label: "Dex #005 Fieldstone", recordType: "business", recordId: "biz_005" },
      { label: "Dex #008 Apex Auto", recordType: "business", recordId: "biz_008" },
    ],
    confidence: "medium",
    caveats: ["Revenue figures for these are estimates, not verified"],
    suggestedNextStep: "Ask Summit whether an annual gutter-cleaning plan would interest customers.",
    reviewStatus: "approved",
    createdAt: "2026-10-22",
  },
];
