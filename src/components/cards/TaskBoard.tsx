// Work board: the same follow-ups and issues as the lists, in status columns.
// Moving a card = a plain form posting to the existing status update (no drag needed,
// so it works on phones and with a keyboard). Columns scroll sideways on phones.

import Link from "next/link";
import { updateAction } from "@/app/actions";
import { priorityTone } from "@/components/cards/ActionRow";
import { cn } from "@/lib/format";
import { dueLabel, dueWhen, kindLabel, type BoardColumn } from "@/lib/ops";
import type { ClientAction } from "@/lib/types";

const COLUMNS: { id: BoardColumn; label: string; tone: string }[] = [
  { id: "open", label: "Open", tone: "text-ink" },
  { id: "in_progress", label: "In progress", tone: "text-teal" },
  { id: "waiting", label: "Waiting on client", tone: "text-amber" },
  { id: "blocked", label: "Blocked", tone: "text-rose" },
  { id: "done", label: "Done · 7 days", tone: "text-lime" },
];

const input = "min-h-9 min-w-0 flex-1 rounded-lg border border-line bg-white/5 px-1.5 text-xs text-ink";
const btn = "pressable min-h-9 rounded-lg border border-line bg-white/5 px-2 text-xs font-semibold";

export function TaskBoard({
  columns,
  today,
  canEdit,
  leadNames,
}: {
  columns: Record<BoardColumn, ClientAction[]>;
  today: string;
  canEdit: boolean;
  leadNames: Map<string, string>;
}) {
  return (
    <div className="-mx-4 snap-x overflow-x-auto px-4 pb-1" role="region" aria-label="Work board" tabIndex={0}>
      <div className="grid w-max auto-cols-[min(78vw,270px)] grid-flow-col gap-2.5">
        {COLUMNS.map((col) => {
          const items = columns[col.id];
          return (
            <section key={col.id} aria-label={col.label} className="glass flex snap-start flex-col rounded-3xl">
              <h3 className={cn("flex items-center justify-between border-b border-line px-3.5 py-2.5 text-sm font-semibold", col.tone)}>
                {col.label}
                <span className="text-xs font-normal text-muted">{items.length}</span>
              </h3>
              {items.length ? (
                <ul className="max-h-[60vh] space-y-2 overflow-y-auto p-2.5">
                  {items.map((a) => {
                    const when = dueWhen(a.dueOn, today);
                    const who = a.client?.name ?? (a.leadGhlId ? (leadNames.get(a.leadGhlId) ?? "Lead") : null);
                    return (
                      <li key={a.id} className="rounded-2xl border border-line bg-white/[0.03] p-2.5">
                        <div className="flex items-start gap-2">
                          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", priorityTone[a.priority].dot)} aria-label={`${priorityTone[a.priority].label} priority`} />
                          <div className="min-w-0 flex-1">
                            <Link href={a.client ? `/clients/${a.client.slug}#next` : "/sales#follow-ups"} className="block text-sm font-semibold leading-snug hover:underline">
                              {a.title}
                            </Link>
                            <p className="mt-0.5 truncate text-[11px] text-muted">
                              {who ? `${who} · ` : ""}
                              {kindLabel(a.kind)}
                            </p>
                            {a.status === "blocked" && (
                              <p className="mt-0.5 text-[11px] text-rose">Blocked{a.blockedReason ? `: ${a.blockedReason}` : " (no reason given)"}</p>
                            )}
                            {a.promisedOn && a.status !== "done" && (
                              <p className={cn("mt-0.5 text-[11px]", a.promisedOn < today ? "font-semibold text-rose" : "text-amber")}>
                                {a.promisedOn < today ? "Promise missed" : "Promised to client"} · {a.promisedOn}
                              </p>
                            )}
                            <p className="mt-0.5 text-[11px]">
                              {col.id === "done" ? (
                                <span className="text-faint">Done {a.doneAt ? a.doneAt.slice(0, 10) : ""}</span>
                              ) : (
                                <span className={when === "overdue" ? "font-semibold text-rose" : when === "today" ? "font-semibold text-amber" : "text-faint"}>
                                  {dueLabel(a.dueOn, today)}
                                </span>
                              )}
                              <span className={a.ownerName ? "text-muted" : "text-amber"}> · {a.ownerName ?? "No owner"}</span>
                            </p>
                          </div>
                        </div>
                        {canEdit && (
                          <form key={`status-${a.status}-${a.blockedReason ?? ""}`} action={updateAction} className="mt-2 flex flex-wrap gap-1.5">
                            <input type="hidden" name="actionId" value={a.id} />
                            <input type="hidden" name="op" value="status" />
                            <select name="status" defaultValue={a.status} aria-label={`Move "${a.title}" to`} className={input}>
                              <option value="open">Open</option>
                              <option value="in_progress">In progress</option>
                              <option value="waiting">Waiting on client</option>
                              <option value="blocked">Blocked</option>
                              <option value="done">Done</option>
                            </select>
                            <button type="submit" className={btn}>
                              Move
                            </button>
                            <input name="reason" maxLength={200} defaultValue={a.blockedReason ?? ""} placeholder="If blocked: by what?" aria-label={`What is blocking "${a.title}"`} className={cn(input, "basis-full")} />
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-3.5 py-3 text-xs text-faint">Nothing here.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
