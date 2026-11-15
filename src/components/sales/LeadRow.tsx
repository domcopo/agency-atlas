// One lead from the sales pipelines: name, stage, value, age, who it's assigned to, the
// last reach-out, and one-tap reach-out buttons. Lead names are shown as plain text.

import { Flame } from "lucide-react";
import { TouchButtons } from "@/components/sales/TouchButtons";
import { formatUsdExact } from "@/lib/format";
import { daysFrom, nyDay, touchLabel, type LeadTouch, type SalesLead } from "@/lib/sales";

function ago(iso: string, today: string): string {
  const d = daysFrom(nyDay(iso), today);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

export function LeadRow({
  lead,
  last,
  owner,
  hot,
  why,
  today,
  canTouch,
}: {
  lead: SalesLead;
  last?: LeadTouch;
  owner: string | null;
  hot: boolean;
  why?: string;
  today: string;
  canTouch: boolean;
}) {
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold leading-snug">
          {hot && <Flame aria-label="Hot stage" className="size-3.5 shrink-0 text-amber" />}
          <span className="min-w-0 break-words">{lead.name}</span>
        </p>
        {why && <p className="mt-0.5 text-xs text-violet">{why}</p>}
        <p className="mt-0.5 text-[11px] text-muted">
          {lead.stage ?? "No stage"}
          {lead.pipelineName ? ` · ${lead.pipelineName}` : ""}
          {lead.value ? ` · ${formatUsdExact(lead.value)}` : ""}
          {lead.createdAt ? ` · added ${ago(lead.createdAt, today)}` : ""}
        </p>
        <p className="text-[11px] text-faint">
          {owner ? `Assigned to ${owner}` : lead.assignedUserId ? "Assigned in GoHighLevel" : "Unassigned"}
          {" · "}
          {last ? `${touchLabel(last.kind)} ${ago(last.at, today)}` : "no reach-out logged"}
        </p>
      </div>
      {canTouch && <TouchButtons leadId={lead.ghlId} />}
    </div>
  );
}
