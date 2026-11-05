// Clients tab: active clients with no owner or no next action, fixable in one tap each.

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { setClientOwner } from "@/app/actions";
import { cn } from "@/lib/format";
import type { RosterClient } from "@/lib/types";

function Row({ c, noNext, staff, canSetOwner }: { c: RosterClient; noNext: boolean; staff: { id: string; name: string }[]; canSetOwner: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
      <Link href={`/clients/${c.id}`} className="min-w-0 flex-1 text-sm font-semibold hover:underline">
        {c.name}
      </Link>
      {canSetOwner ? (
        <form action={setClientOwner} className="flex items-center gap-1.5">
          <input type="hidden" name="clientId" value={c.dbId} />
          <input type="hidden" name="slug" value={c.id} />
          <select
            name="ownerId"
            defaultValue={c.ownerId ?? ""}
            aria-label={`Owner for ${c.name}`}
            className={cn("min-h-10 max-w-36 rounded-xl border bg-white/5 px-2 text-sm", c.ownerId ? "border-line" : "border-amber/50 text-amber")}
          >
            <option value="">No owner</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button type="submit" className="pressable min-h-10 rounded-xl border border-line bg-white/5 px-3 text-xs font-semibold">
            Save
          </button>
        </form>
      ) : (
        <span className={cn("text-xs", c.ownerName ? "text-muted" : "text-amber")}>{c.ownerName ?? "No owner"}</span>
      )}
      {noNext && (
        <Link href={`/clients/${c.id}#next`} className="flex w-full items-center gap-1 text-xs text-violet">
          No next action: add one <ArrowRight aria-hidden className="size-3" />
        </Link>
      )}
    </div>
  );
}

export function OwnerGaps({
  clients,
  noNextIds,
  staff,
  canSetOwner,
}: {
  clients: RosterClient[];
  noNextIds: Set<string>;
  staff: { id: string; name: string }[];
  canSetOwner: boolean;
}) {
  if (!clients.length) return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Every active client has an owner and a next action.</p>;
  const top = clients.slice(0, 5);
  const rest = clients.slice(5);
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="divide-y divide-line">
        {top.map((c) => (
          <Row key={c.id} c={c} noNext={noNextIds.has(c.id)} staff={staff} canSetOwner={canSetOwner} />
        ))}
      </div>
      {rest.length > 0 && (
        <details className="border-t border-line">
          <summary className="pressable flex min-h-11 cursor-pointer list-none items-center justify-center text-sm font-semibold text-violet">
            Show all {clients.length}
          </summary>
          <div className="divide-y divide-line border-t border-line">
            {rest.map((c) => (
              <Row key={c.id} c={c} noNext={noNextIds.has(c.id)} staff={staff} canSetOwner={canSetOwner} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
