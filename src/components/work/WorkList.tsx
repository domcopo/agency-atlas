// The Work list: open items in Overdue / Today / This week / Later groups that fold
// open and closed (plain <details>, no extra JavaScript), and "Done this week" folded at
// the bottom. Column headings show on computers only.

import { ChevronDown } from "lucide-react";
import { WorkRow, type RowProps } from "@/components/work/WorkRow";
import { cn } from "@/lib/format";
import type { ClientAction } from "@/lib/types";
import { HUB_GROUPS, type HubGroup } from "@/lib/work-hub";

type Shared = Omit<RowProps, "a" | "leadName">;

const GROUP_TONE: Record<HubGroup, string> = { overdue: "text-rose", today: "text-amber", week: "text-ink", later: "text-ink" };

function Group({ id, title, items, open, shared, leadName, tone }: { id: string; title: string; items: ClientAction[]; open: boolean; shared: Shared; leadName: (a: ClientAction) => string | undefined; tone: string }) {
  return (
    <details open={open} className="group/g border-t border-line first:border-t-0" aria-label={title} id={`group-${id}`}>
      <summary className="pressable flex min-h-11 cursor-pointer list-none items-center gap-2 bg-white/[0.02] px-3 lg:min-h-9 [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden className="size-4 shrink-0 -rotate-90 text-muted transition-transform group-open/g:rotate-0 motion-reduce:transition-none" />
        <span className={cn("text-sm font-semibold", tone)}>{title}</span>
        <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-xs font-semibold text-muted">{items.length}</span>
      </summary>
      <ul>
        {items.map((a) => (
          <WorkRow key={a.id} a={a} leadName={leadName(a)} {...shared} />
        ))}
      </ul>
    </details>
  );
}

export function WorkList({
  groups,
  done,
  shared,
  leadName,
  empty,
}: {
  groups: Record<HubGroup, ClientAction[]>;
  done: ClientAction[];
  shared: Shared;
  leadName: (a: ClientAction) => string | undefined;
  empty: React.ReactNode;
}) {
  const shown = HUB_GROUPS.filter((g) => groups[g.id].length);
  return (
    <div className="glass @container overflow-visible rounded-2xl">
      <div aria-hidden className="hidden grid-cols-[36px_minmax(0,1fr)_minmax(0,11rem)_8.5rem_9.5rem_8rem_36px] gap-x-3 border-b border-line px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted @3xl:grid">
        <span />
        <span>Title</span>
        <span>Client</span>
        <span>Owner</span>
        <span>Due</span>
        <span>Status</span>
        <span />
      </div>
      {shown.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted">{empty}</div>
      ) : (
        shown.map((g) => <Group key={g.id} id={g.id} title={g.label} items={groups[g.id]} open shared={shared} leadName={leadName} tone={GROUP_TONE[g.id]} />)
      )}
      {done.length > 0 && <Group id="done" title="Done this week" items={done} open={false} shared={shared} leadName={leadName} tone="text-lime" />}
    </div>
  );
}
