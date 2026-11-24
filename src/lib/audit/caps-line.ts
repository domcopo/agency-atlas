// One plain line about audit spending for the builder ("$0 of $10 used this week").

import type { SpendSummary } from "./spend";

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

export function capsLine(settings: { ready: boolean; caps: { perAuditUsd: number } }, spend: SpendSummary | null): string | null {
  if (!settings.ready || !spend) return null;
  return `Caps: ${money(settings.caps.perAuditUsd)} per audit, ${money(spend.weekUsed)} of ${money(spend.weekCap)} used this week.`;
}
