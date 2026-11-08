// One actionable line: a saved follow-up/issue (with Done · Reschedule · Assign),
// or a rule-based flag (with Open client · Add next action).
// Plain HTML forms posting to server actions, so it works without extra JavaScript.

import { ArrowRight, Check, CalendarClock, UserRound } from "lucide-react";
import Link from "next/link";
import { completeReminder, updateAction } from "@/app/actions";
import { cn } from "@/lib/format";
import type { ActionPriority, PriorityItem } from "@/lib/types";

export const priorityTone: Record<ActionPriority, { label: string; dot: string; text: string }> = {
  critical: { label: "Critical", dot: "bg-rose", text: "text-rose" },
  high: { label: "High", dot: "bg-amber", text: "text-amber" },
  normal: { label: "Normal", dot: "bg-sky/70", text: "text-muted" },
  low: { label: "Low", dot: "bg-white/30", text: "text-faint" },
};

const whenTone = { overdue: "text-rose font-semibold", today: "text-amber font-semibold", upcoming: "text-muted", none: "text-faint" } as const;

const btn = "pressable inline-flex min-h-10 items-center gap-1 rounded-xl border border-line bg-white/5 px-3 text-xs font-semibold";
const input = "min-h-10 rounded-xl border border-line bg-white/5 px-2 text-sm text-ink";

export function ActionRow({
  item,
  staff,
  canEdit,
  slug,
  statusOnly = false,
}: {
  item: PriorityItem;
  staff: { id: string; name: string }[];
  canEdit: boolean;
  /** Client page to refresh after a change. */
  slug?: string;
  /** Developers: only Done and status (no reschedule / reassign). */
  statusOnly?: boolean;
}) {
  const a = item.action;
  const tone = priorityTone[item.priority];
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", tone.dot)} aria-label={`${tone.label} priority`} />
        <div className="min-w-0 flex-1">
          <Link href={item.href} className="block text-sm font-semibold leading-snug hover:underline">
            {item.title}
          </Link>
          <p className={cn("mt-0.5 text-xs", whenTone[item.when])}>{item.reason}</p>
          {item.plan && <p className="mt-0.5 text-[11px] text-faint">{item.plan}</p>}
          {item.why && item.why.length > 0 && (
            <p className="mt-0.5 text-[11px] text-violet/90" title={`Rank score ${item.score ?? 0} of 100`}>
              Why here: {item.why.slice(0, 3).join(" · ")}
            </p>
          )}
          {a?.notes && <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted">{a.notes}</p>}
          <p className="mt-1 flex items-center gap-1 text-[11px]">
            <UserRound aria-hidden className="size-3 text-faint" />
            {item.ownerName ? <span className="text-muted">{item.ownerName}</span> : <span className="text-amber">No owner</span>}
            {item.priority !== "normal" && <span className={cn("ml-1.5", tone.text)}>· {tone.label}</span>}
          </p>
        </div>
      </div>

      {canEdit && a && (
        <div className="flex flex-wrap gap-1.5 pl-[18px]">
          <form action={updateAction}>
            <input type="hidden" name="actionId" value={a.id} />
            <input type="hidden" name="op" value="done" />
            {slug && <input type="hidden" name="slug" value={slug} />}
            <button type="submit" className={cn(btn, "border-lime/40 text-lime")}>
              <Check aria-hidden className="size-3.5" /> Done
            </button>
          </form>
          {!statusOnly && (
          <>
          <details className="group">
            <summary className={cn(btn, "list-none")}>
              <CalendarClock aria-hidden className="size-3.5" /> Reschedule
            </summary>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(["tomorrow", "week"] as const).map((p) => (
                <form key={p} action={updateAction}>
                  <input type="hidden" name="actionId" value={a.id} />
                  <input type="hidden" name="op" value="reschedule" />
                  <input type="hidden" name="preset" value={p} />
                  {slug && <input type="hidden" name="slug" value={slug} />}
                  <button type="submit" className={btn}>
                    {p === "tomorrow" ? "Tomorrow" : "Next week"}
                  </button>
                </form>
              ))}
              <form action={updateAction} className="flex gap-1.5">
                <input type="hidden" name="actionId" value={a.id} />
                <input type="hidden" name="op" value="reschedule" />
                {slug && <input type="hidden" name="slug" value={slug} />}
                <input type="date" name="due" required aria-label="New due date" className={input} />
                <button type="submit" className={btn}>
                  Set
                </button>
              </form>
              <form key={`promise-${a.promisedOn ?? ""}`} action={updateAction} className="flex w-full flex-wrap items-center gap-1.5">
                <input type="hidden" name="actionId" value={a.id} />
                <input type="hidden" name="op" value="promise" />
                {slug && <input type="hidden" name="slug" value={slug} />}
                <span className="text-[11px] text-muted">Promised to client by</span>
                <input type="date" name="promised" defaultValue={a.promisedOn ?? ""} aria-label="Promised to client by" className={input} />
                <button type="submit" className={btn}>
                  Save
                </button>
              </form>
            </div>
          </details>
          <details className="group">
            <summary className={cn(btn, "list-none")}>
              <UserRound aria-hidden className="size-3.5" /> Assign
            </summary>
            <form key={`assign-${a.ownerId ?? ""}`} action={updateAction} className="mt-1.5 flex gap-1.5">
              <input type="hidden" name="actionId" value={a.id} />
              <input type="hidden" name="op" value="assign" />
              {slug && <input type="hidden" name="slug" value={slug} />}
              <select name="ownerId" defaultValue={a.ownerId ?? ""} aria-label="Owner" className={input}>
                <option value="">No owner</option>
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button type="submit" className={btn}>
                Save
              </button>
            </form>
          </details>
          </>
          )}
          <form key={`status-${a.status}-${a.blockedReason ?? ""}`} action={updateAction} className="flex flex-wrap gap-1.5">
              <input type="hidden" name="actionId" value={a.id} />
              <input type="hidden" name="op" value="status" />
              {slug && <input type="hidden" name="slug" value={slug} />}
              <select name="status" defaultValue={a.status} aria-label="Status" className={input}>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="waiting">Waiting</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
              <input name="reason" maxLength={200} defaultValue={a.blockedReason ?? ""} placeholder="If blocked: by what?" aria-label="What is blocking it" className={cn(input, "w-36")} />
              <button type="submit" className={btn}>
                Update
              </button>
            </form>
        </div>
      )}

      {!a && item.clientSlug && (
        <div className="flex flex-wrap gap-1.5 pl-[18px]">
          {canEdit && item.flagKind && (
            <form action={completeReminder}>
              <input type="hidden" name="slug" value={item.clientSlug} />
              <input type="hidden" name="kind" value={item.flagKind} />
              <input type="hidden" name="title" value={item.title} />
              <button type="submit" className={cn(btn, "border-lime/40 text-lime")} title={item.flagKind === "contact" ? "Logs a contact today" : "Saves your note as done"}>
                <Check aria-hidden className="size-3.5" /> Done
              </button>
            </form>
          )}
          <Link href={`/clients/${item.clientSlug}#next`} className={cn(btn, "border-violet/40 text-violet")}>
            Add next action <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

/** Top items, with the rest tucked behind "Show all". */
export function PriorityList({
  items,
  staff,
  canEdit,
  limit,
  slug,
  empty,
}: {
  items: PriorityItem[];
  staff: { id: string; name: string }[];
  canEdit: boolean;
  limit: number;
  slug?: string;
  empty: string;
}) {
  if (!items.length) return <p className="glass rounded-3xl px-4 py-4 text-sm text-muted">{empty}</p>;
  const top = items.slice(0, limit);
  const rest = items.slice(limit);
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <ol className="divide-y divide-line">
        {top.map((i) => (
          <li key={i.id}>
            <ActionRow item={i} staff={staff} canEdit={canEdit} slug={slug} />
          </li>
        ))}
      </ol>
      {rest.length > 0 && (
        <details className="border-t border-line">
          <summary className="pressable flex min-h-11 cursor-pointer list-none items-center justify-center text-sm font-semibold text-violet">
            Show all {items.length}
          </summary>
          <ol className="divide-y divide-line border-t border-line">
            {rest.map((i) => (
              <li key={i.id}>
                <ActionRow item={i} staff={staff} canEdit={canEdit} slug={slug} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

export const healthTone = {
  at_risk: { label: "At risk", pill: "border-rose/50 bg-rose/12 text-rose" },
  needs_attention: { label: "Needs attention", pill: "border-amber/50 bg-amber/12 text-amber" },
  opportunity: { label: "Opportunity", pill: "border-lime/50 bg-lime/12 text-lime" },
  healthy: { label: "Healthy", pill: "border-teal/50 bg-teal/12 text-teal" },
} as const;
