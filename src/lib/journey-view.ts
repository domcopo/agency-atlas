// Small helpers that turn a journey into what list screens show.

import { formatDate } from "@/lib/format";
import { journeyLabel, type JourneyState } from "@/lib/journey";

/** The clients-list track: stage, one-line label, overdue or not. null when not tracked. */
export function journeyRow(j: JourneyState | undefined): { stage: number; label: string; overdue: boolean; started: boolean } | null {
  if (!j) return null;
  return { stage: j.stage, label: journeyLabel(j, formatDate), overdue: Boolean(j.next?.overdue), started: Boolean(j.startedOn) };
}
