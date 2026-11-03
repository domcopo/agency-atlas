// SYNTHETIC DATA — invented clients for the demo. Names, emails and phone numbers
// are fictional: emails use the reserved example.com domain and phone numbers use
// the 555-01XX range reserved for fiction. Never mix real data into this file.

import type { Client } from "@/lib/types";

export const clients: Client[] = [
  {
    id: "cli_brightline",
    isSynthetic: true,
    businessId: "biz_001",
    name: "Brightline Dental Studio",
    industry: "Dental",
    dataSensitivity: "regulated",
    primaryContact: {
      name: "Dana Reyes (fictional)",
      email: "dana.reyes@example.com",
      phone: "555-0142",
    },
    clientSince: "2025-03-01",
    health: { score: 58, status: "at_risk", trend: [74, 73, 71, 69, 66, 63, 60, 58] },
    metrics: [
      { label: "Show rate", value: 72, previous: 81, unit: "percent", betterWhen: "higher" },
      { label: "New leads (month)", value: 64, previous: 59, unit: "count", betterWhen: "higher" },
      { label: "Avg first reply", value: 38, previous: 22, unit: "minutes", betterWhen: "lower" },
      { label: "Booked value (month)", value: 41_500, previous: 44_800, unit: "usd", betterWhen: "higher" },
    ],
    goals: ["Get show rate back above 80%", "Fill evening slots on Tue/Thu"],
    blockers: ["Front desk short-staffed until mid-November"],
    whatChanged: [
      "Show rate dropped 9 points vs last month",
      "Reply time is slower on weekday mornings",
      "Lead volume is still growing",
    ],
    notes: [
      {
        id: "note_b1",
        author: "Agency staff (demo)",
        createdAt: "2026-10-27T15:10:00Z",
        text: "Owner agreed to test a second reminder 24h before visits. Revisit in two weeks.",
      },
    ],
  },
  {
    id: "cli_summit",
    isSynthetic: true,
    businessId: "biz_002",
    name: "Summit Roof & Gutter",
    industry: "Home services",
    dataSensitivity: "standard",
    primaryContact: {
      name: "Marcus Hale (fictional)",
      email: "marcus.hale@example.com",
      phone: "555-0117",
    },
    clientSince: "2024-11-15",
    health: { score: 86, status: "thriving", trend: [70, 72, 75, 78, 80, 83, 85, 86] },
    metrics: [
      { label: "Show rate", value: 88, previous: 85, unit: "percent", betterWhen: "higher" },
      { label: "New leads (month)", value: 132, previous: 94, unit: "count", betterWhen: "higher" },
      { label: "Avg first reply", value: 11, previous: 14, unit: "minutes", betterWhen: "lower" },
      { label: "Booked value (month)", value: 186_000, previous: 142_000, unit: "usd", betterWhen: "higher" },
    ],
    goals: ["Keep quote turnaround under 3 days", "Add gutter-guard upsell"],
    blockers: ["Only one inspector during the storm surge"],
    whatChanged: [
      "Leads up 40% after the regional storm",
      "Quote turnaround slipped from 2 to 4 days",
    ],
    notes: [
      {
        id: "note_s1",
        author: "Agency staff (demo)",
        createdAt: "2026-10-24T18:45:00Z",
        text: "Discussed hiring a seasonal inspector. Owner will decide by Nov 7.",
      },
    ],
  },
  {
    id: "cli_copper",
    isSynthetic: true,
    businessId: "biz_003",
    name: "Copper Kettle Catering",
    industry: "Events & food",
    dataSensitivity: "standard",
    primaryContact: {
      name: "Priya Nandakumar (fictional)",
      email: "priya.n@example.com",
      phone: "555-0183",
    },
    clientSince: "2026-05-20",
    health: { score: 71, status: "steady", trend: [66, 68, 70, 69, 72, 70, 71, 71] },
    metrics: [
      { label: "Show rate", value: 79, previous: 77, unit: "percent", betterWhen: "higher" },
      { label: "New leads (month)", value: 41, previous: 45, unit: "count", betterWhen: "higher" },
      { label: "Avg first reply", value: 1_140, previous: 1_020, unit: "minutes", betterWhen: "lower" },
      { label: "Booked value (month)", value: 28_900, previous: 26_300, unit: "usd", betterWhen: "higher" },
    ],
    goals: ["Book 12 tastings before holiday season"],
    blockers: ["No one answers inquiries on weekends"],
    whatChanged: ["Weekend inquiries waiting ~19 hours for a reply", "Booked value up slightly"],
    notes: [],
  },
];
