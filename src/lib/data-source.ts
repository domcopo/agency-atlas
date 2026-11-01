// The ONE place screens get their data from.
//
// Phase 1: everything comes from the synthetic fixtures in src/fixtures.
// Phase 2 will replace the inside of these functions with signed-in,
// permission-checked database reads. Screens should not need to change.
//
// Rule: screens never import fixtures directly — always go through here.

import { businesses } from "@/fixtures/businesses";
import { clients } from "@/fixtures/clients";
import { insights } from "@/fixtures/insights";
import { missionControl } from "@/fixtures/mission-control";
import { safetyStatus } from "@/fixtures/safety";
import type {
  Business,
  Client,
  DataMode,
  Insight,
  MissionControlData,
  SafetyStatus,
} from "@/lib/types";

export const DATA_MODE: DataMode = "mock";

export function getMissionControl(): MissionControlData {
  return missionControl;
}

export function getClients(): Client[] {
  return clients;
}

export function getClient(id: string): Client | undefined {
  return clients.find((c) => c.id === id);
}

export function getBusinesses(): Business[] {
  return [...businesses].sort((a, b) => a.dexNumber - b.dexNumber);
}

export function getBusiness(id: string): Business | undefined {
  return businesses.find((b) => b.id === id);
}

export function getInsights(): Insight[] {
  return insights;
}

export function getSafetyStatus(): SafetyStatus {
  return safetyStatus;
}

/** Tags shared by two or more businesses, most common first. */
export function getPatterns(): { tag: string; businessIds: string[] }[] {
  const byTag = new Map<string, string[]>();
  for (const b of businesses) {
    for (const tag of b.patternTags) {
      byTag.set(tag, [...(byTag.get(tag) ?? []), b.id]);
    }
  }
  return [...byTag.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .map(([tag, businessIds]) => ({ tag, businessIds }))
    .sort((a, b) => b.businessIds.length - a.businessIds.length || a.tag.localeCompare(b.tag));
}
