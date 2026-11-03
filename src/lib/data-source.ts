// The ONE place screens get their data from.
//
// Now: everything comes from the synthetic fixtures in src/fixtures.
// Phase 2 will replace the inside of these functions with signed-in,
// permission-checked database reads. Screens should not need to change.
//
// Rule: screens never import fixtures directly — always go through here.

import { buyers } from "@/fixtures/buyers";
import { conversations } from "@/fixtures/conversations";
import { deals } from "@/fixtures/deals";
import { insights } from "@/fixtures/insights";
import { leads } from "@/fixtures/leads";
import { missionControl } from "@/fixtures/mission-control";
import { safetyStatus } from "@/fixtures/safety";
import { team } from "@/fixtures/team";
import type {
  Buyer,
  Conversation,
  DataMode,
  Deal,
  Insight,
  Lead,
  MissionControlData,
  SafetyStatus,
  TeamMember,
} from "@/lib/types";

export const DATA_MODE: DataMode = "mock";

export function getMissionControl(): MissionControlData {
  return missionControl;
}

export function getTeam(): TeamMember[] {
  return team;
}

export function getTeamMemberName(id: string): string {
  return team.find((m) => m.id === id)?.name ?? "Unassigned";
}

/** Leads, best grade first. */
export function getLeads(): Lead[] {
  return [...leads].sort((a, b) => b.grade.score - a.grade.score);
}

export function getLead(id: string): Lead | undefined {
  return leads.find((l) => l.id === id);
}

/** Leads someone should work today: still open and due (or never contacted). */
export function getLeadsToWork(today: string) {
  const open = getLeads().filter((l) => l.stage !== "dead" && l.stage !== "under_contract");
  const overdue = open.filter((l) => l.nextFollowUp !== undefined && l.nextFollowUp < today);
  const dueToday = open.filter((l) => l.nextFollowUp === today);
  const uncontacted = open.filter((l) => l.stage === "new");
  const all = open.filter(
    (l) => (l.nextFollowUp !== undefined && l.nextFollowUp <= today) || l.stage === "new",
  );
  return { all, overdue, dueToday, uncontacted };
}

const dealOrder: Record<Deal["stage"], number> = {
  under_contract: 0,
  in_dispo: 1,
  assigned: 2,
  closed: 3,
  fell_through: 4,
};

/** Deals, the ones needing attention first. */
export function getDeals(): Deal[] {
  return [...deals].sort(
    (a, b) =>
      Number(b.needsReview) - Number(a.needsReview) ||
      dealOrder[a.stage] - dealOrder[b.stage] ||
      a.closingAt.localeCompare(b.closingAt),
  );
}

export function getDeal(id: string): Deal | undefined {
  return deals.find((d) => d.id === id);
}

export function getDealForLead(leadId: string): Deal | undefined {
  return deals.find((d) => d.leadId === leadId);
}

/** Deals currently being marketed to buyers. */
export function getDispoDeals(): Deal[] {
  return getDeals().filter((d) => d.stage === "in_dispo" || d.stage === "under_contract");
}

export function getBuyers(): Buyer[] {
  return [...buyers].sort((a, b) => a.dexNumber - b.dexNumber);
}

export function getBuyer(id: string): Buyer | undefined {
  return buyers.find((b) => b.id === id);
}

/** Tags shared by two or more buyers, most common first. */
export function getBuyerPatterns(): { tag: string; buyerIds: string[] }[] {
  const byTag = new Map<string, string[]>();
  for (const b of buyers) {
    for (const tag of b.tags) byTag.set(tag, [...(byTag.get(tag) ?? []), b.id]);
  }
  return [...byTag.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .map(([tag, buyerIds]) => ({ tag, buyerIds }))
    .sort((a, b) => b.buyerIds.length - a.buyerIds.length || a.tag.localeCompare(b.tag));
}

/** Newest first. */
export function getConversations(): Conversation[] {
  return [...conversations].sort((a, b) => b.at.localeCompare(a.at));
}

export function getConversationsForLead(leadId: string): Conversation[] {
  return getConversations().filter((c) => c.leadId === leadId);
}

export function getInsights(): Insight[] {
  return insights;
}

export function getSafetyStatus(): SafetyStatus {
  return safetyStatus;
}
