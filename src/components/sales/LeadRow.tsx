// One lead from the sales pipelines, short (SALES_SIMPLIFY_PLAN, 2026-11-17): name (flame
// for a hot stage), why it's listed (or stage · value · age), and the last reach-out.
// Tapping it opens the lead page; a small "Log reach-out" fold keeps the quick one-tap log.
// Lead names are shown as plain text.

import { ChevronRight, Flame } from "lucide-react";
import Link from "next/link";
import { TouchButtons } from "@/components/sales/TouchButtons";
import { formatUsdExact } from "@/lib/format";
import { daysFrom, nyDay, touchLabel, type LeadTouch, type SalesLead } from "@/lib/sales";

export function ago(iso: string, today: string): string {
  const d = daysFrom(nyDay(iso), today);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

export const leadHref = (ghlId: string) => `/sales/lead/${encodeURIComponent(ghlId)}`;

/** "Proposal sent · $1,500 · added 3 days ago" */
export function leadFacts(lead: SalesLead, today: string): string {
  return [lead.stage ?? "No stage", lead.value ? formatUsdExact(lead.value) : null, lead.createdAt ? `added ${ago(lead.createdAt, today)}` : null].filter(Boolean).join(" · ");
}

export function LeadRow({
  lead,
  last,
  hot,
  why,
  today,
  canTouch,
}: {
  lead: SalesLead;
  last?: LeadTouch;
  hot: boolean;
  why?: string;
  today: string;
  canTouch: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <Link href={leadHref(lead.ghlId)} className="pressable -mx-1 flex items-center gap-2 rounded-xl px-1">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold leading-snug">
            {hot && <Flame aria-label="Hot stage" className="size-3.5 shrink-0 text-amber" />}
            <span className="min-w-0 break-words">{lead.name}</span>
          </span>
          <span className={`mt-0.5 block text-xs ${why ? "text-violet" : "text-muted"}`}>{why ?? leadFacts(lead, today)}</span>
          <span className="block text-[11px] text-faint">{last ? `${touchLabel(last.kind)} ${ago(last.at, today)}` : "No reach-out logged"}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />
      </Link>
      {canTouch && (
        <details className="group mt-1.5">
          <summary className="pressable inline-flex min-h-10 cursor-pointer list-none items-center rounded-xl border border-line bg-white/5 px-3 text-xs font-semibold text-violet [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Log reach-out</span>
            <span className="hidden group-open:inline">Close</span>
          </summary>
          <div className="mt-2">
            <TouchButtons leadId={lead.ghlId} />
          </div>
        </details>
      )}
    </div>
  );
}
