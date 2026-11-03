// SYNTHETIC DATA — these "insights" were written by hand for the demo.
// No AI produced them and they are not analysis of real data.

import type { Insight } from "@/lib/types";

export const insights: Insight[] = [
  {
    id: "ins_1",
    isSynthetic: true,
    generatedBy: "mock_ai",
    title: "Sellers with a deadline reach contract faster",
    observation:
      "The three most recent contracts all came from sellers who said ASAP or 30 days on the first call.",
    evidence: [
      { label: "903 Sycamore St (deal)", recordType: "deal", recordId: "deal_01" },
      { label: "16 Lantern Way (deal)", recordType: "deal", recordId: "deal_02" },
      { label: "27 Wharf Ln (deal)", recordType: "deal", recordId: "deal_03" },
    ],
    confidence: "medium",
    caveats: ["Only 14 leads in the sample", "Timeline is what the seller said, not verified"],
    suggestedNextStep: "Ask the timeline question on every first call and log the answer.",
    reviewStatus: "unreviewed",
    createdAt: "2026-11-01",
  },
  {
    id: "ins_2",
    isSynthetic: true,
    generatedBy: "mock_ai",
    title: "Two buyers close in under two weeks with verified funds",
    observation:
      "Ironwood Homes and Two Rivers Flips both have proof of funds on file and close in 10–14 days. Both made offers on 16 Lantern Way.",
    evidence: [
      { label: "Dex #001 Ironwood", recordType: "buyer", recordId: "buyer_01" },
      { label: "Dex #005 Two Rivers", recordType: "buyer", recordId: "buyer_05" },
      { label: "16 Lantern Way (deal)", recordType: "deal", recordId: "deal_02" },
    ],
    confidence: "high",
    caveats: ["Proof of funds can go stale; Ironwood's was checked Oct 15"],
    suggestedNextStep: "Call these two first when a turnkey Lakeview deal goes under contract.",
    reviewStatus: "approved",
    createdAt: "2026-10-31",
  },
  {
    id: "ins_3",
    isSynthetic: true,
    generatedBy: "mock_ai",
    title: "Walkthroughs missed the big-ticket repairs twice",
    observation:
      "A foundation issue sank 12 Kestrel Ct, and the roof at 903 Sycamore St is worse than first noted.",
    evidence: [
      { label: "12 Kestrel Ct (deal)", recordType: "deal", recordId: "deal_05" },
      { label: "903 Sycamore St (deal)", recordType: "deal", recordId: "deal_01" },
    ],
    confidence: "low",
    caveats: ["Two examples only", "Could be bad luck rather than a process gap"],
    suggestedNextStep: "Add roof and foundation photos to the walkthrough checklist.",
    reviewStatus: "unreviewed",
    createdAt: "2026-10-30",
  },
];
