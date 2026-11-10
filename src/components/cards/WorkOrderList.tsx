// Work orders grouped by person: a one-line breakdown per person, then each item with
// its steps, the GoHighLevel link it came from, and simple controls. Plain forms post to
// the same server actions as everywhere else (the database has the final say).
// mode "developer": status only (developers can't reassign or edit; the database enforces it).

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { updateAction } from "@/app/actions";
import { priorityTone } from "@/components/cards/ActionRow";
import { WorkPromptButton } from "@/components/forms/WorkPromptButton";
import { cn } from "@/lib/format";
import { dueLabel, dueWhen, EST_OPTIONS, kindLabel, minutesLabel, needsReview, parseSteps, promiseMissed, stepProgress, type WorkOrderGroup, type WorkOrderStats } from "@/lib/ops";
import type { ClientAction } from "@/lib/types";

const input = "min-h-9 min-w-0 rounded-lg border border-line bg-white/5 px-1.5 text-xs text-ink";
const btn = "pressable min-h-9 shrink-0 rounded-lg border border-line bg-white/5 px-2.5 text-xs font-semibold";

const statusLabel: Record<ClientAction["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  waiting: "Waiting on client",
  blocked: "Blocked",
  review: "Ready for review",
  done: "Done",
  canceled: "Canceled",
};

export function StatsLine({ s }: { s: WorkOrderStats }) {
  const bits: { text: string; tone?: string }[] = [{ text: `${s.open} open` }];
  if (s.overdue) bits.push({ text: `${s.overdue} overdue`, tone: "text-rose font-semibold" });
  if (s.dueThisWeek) bits.push({ text: `${s.dueThisWeek} due this week`, tone: "text-amber" });
  if (s.blocked) bits.push({ text: `${s.blocked} blocked`, tone: "text-rose" });
  if (s.inReview) bits.push({ text: `${s.inReview} in review`, tone: "text-violet" });
  if (s.estMinutesOpen) bits.push({ text: `~${minutesLabel(s.estMinutesOpen)} planned${s.noEstimate ? ` (+${s.noEstimate} unestimated)` : ""}` });
  bits.push({ text: `${s.done7} done this week${s.doneLate7 ? ` (${s.doneLate7} late)` : ""}`, tone: "text-lime" });
  if (s.sentBack) bits.push({ text: `sent back ${s.sentBack}×`, tone: "text-amber" });
  return (
    <span className="text-xs text-muted">
      {bits.map((b, i) => (
        <span key={b.text}>
          {i > 0 && " · "}
          <span className={b.tone}>{b.text}</span>
        </span>
      ))}
    </span>
  );
}

/** Approve as done, or send back with a short note (owner and managers; the server checks). */
export function ReviewButtons({ a }: { a: ClientAction }) {
  return (
    <div className="space-y-1.5 rounded-xl border border-violet/40 bg-violet/5 p-2">
      <p className="text-[11px] font-semibold text-violet">Ready for review: check the work, then:</p>
      <div className="flex flex-wrap gap-1.5">
        <form action={updateAction}>
          <input type="hidden" name="actionId" value={a.id} />
          <input type="hidden" name="op" value="approve" />
          <button type="submit" className={cn(btn, "border-lime/50 text-lime")}>
            Approve as done
          </button>
        </form>
        <form action={updateAction} className="flex min-w-0 flex-1 gap-1.5">
          <input type="hidden" name="actionId" value={a.id} />
          <input type="hidden" name="op" value="sendback" />
          <input name="note" maxLength={200} placeholder="What still needs fixing?" aria-label={`Why "${a.title}" is sent back`} className={cn(input, "flex-1")} />
          <button type="submit" className={cn(btn, "border-amber/50 text-amber")}>
            Send back
          </button>
        </form>
      </div>
    </div>
  );
}

/** Owner only (the database refuses anyone else): hide work for good, kept in history, can be restored. */
function CancelForm({ a }: { a: ClientAction }) {
  return (
    <details>
      <summary className="pressable inline-flex min-h-9 cursor-pointer list-none items-center text-xs font-semibold text-rose">Cancel this work order</summary>
      <form action={updateAction} className="mt-1.5 flex flex-wrap gap-1.5">
        <input type="hidden" name="actionId" value={a.id} />
        <input type="hidden" name="op" value="cancel" />
        <input name="note" maxLength={200} placeholder="Why? (optional, e.g. duplicate)" aria-label={`Why "${a.title}" is canceled`} className={cn(input, "flex-1")} />
        <button type="submit" className={cn(btn, "border-rose/50 text-rose")}>
          Cancel it
        </button>
      </form>
      <p className="mt-1 text-[11px] text-faint">It leaves every list and workload but isn&apos;t deleted: restore it any time from &quot;Canceled&quot;.</p>
    </details>
  );
}

function ItemCard({
  a,
  today,
  mode,
  staff,
  canUseAi,
  canCancel,
}: {
  a: ClientAction;
  today: string;
  mode: "manage" | "developer";
  staff: { id: string; name: string }[];
  canUseAi: boolean;
  canCancel: boolean;
}) {
  const steps = parseSteps(a.steps);
  const progress = stepProgress(a);
  const when = dueWhen(a.dueOn, today);
  const missed = promiseMissed(a, today);
  return (
    <li id={`wo-${a.id}`} className="scroll-mt-4 rounded-2xl border border-line bg-white/[0.03] p-3">
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", priorityTone[a.priority].dot)} aria-label={`${priorityTone[a.priority].label} priority`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{a.title}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {a.client ? (
              mode === "manage" ? (
                <Link href={`/clients/${a.client.slug}`} className="hover:underline">
                  {a.client.name}
                </Link>
              ) : (
                a.client.name
              )
            ) : (
              "No client"
            )}
            {" · "}
            {kindLabel(a.kind)} · <span className={priorityTone[a.priority].text}>{priorityTone[a.priority].label}</span>
            {a.aiSuggested && <span className="text-violet"> · from AI draft</span>}
          </p>
          <p className="mt-0.5 text-[11px]">
            {a.status === "done" ? (
              <span className="text-lime">Done {a.doneAt?.slice(0, 10)}</span>
            ) : (
              <span className={when === "overdue" ? "font-semibold text-rose" : when === "today" ? "font-semibold text-amber" : "text-faint"}>{dueLabel(a.dueOn, today)}</span>
            )}
            {a.status !== "done" && a.status !== "open" && <span className={a.status === "blocked" ? "text-rose" : "text-teal"}> · {statusLabel[a.status]}</span>}
            {a.status === "blocked" && <span className="text-rose">{a.blockedReason ? `: ${a.blockedReason}` : " (no reason given)"}</span>}
            {a.promisedOn && a.status !== "done" && (
              <span className={missed ? "font-semibold text-rose" : "text-amber"}> · {missed ? "promise missed" : "promised to client"} {a.promisedOn}</span>
            )}
            {a.estMinutes ? <span className="text-faint"> · ~{minutesLabel(a.estMinutes)}</span> : null}
          </p>
          {a.status === "review" && a.submittedAt && <p className="mt-0.5 text-[11px] text-violet">Sent for review {a.submittedAt.slice(0, 10)}{a.sentBackCount ? ` · sent back ${a.sentBackCount}× before` : ""}</p>}
          {a.status !== "review" && a.status !== "done" && a.reviewNote && <p className="mt-0.5 text-[11px] font-semibold text-amber">Sent back: {a.reviewNote}</p>}
        </div>
      </div>

      {steps.length > 0 && (
        <>
          {progress && progress.done > 0 && (
            <p className={cn("mt-2 pl-4 text-[11px] font-semibold", progress.done === progress.total ? "text-lime" : "text-teal")}>
              {progress.done} of {progress.total} steps ticked
            </p>
          )}
          <ol className="mt-1 list-decimal space-y-0.5 pl-9 text-xs text-muted">
            {steps.map((s, i) => (
              <li key={`${i}-${s}`} className={progress?.ticked.has(i + 1) ? "text-faint line-through" : undefined}>
                {s}
              </li>
            ))}
          </ol>
        </>
      )}
      {a.notes && <p className="mt-1.5 pl-4 text-xs text-muted">{a.notes}</p>}
      {(a.sourceLink || a.sourceNote) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 pl-4 text-[11px] text-muted">
          {a.sourceNote && <span>From: {a.sourceNote}</span>}
          {a.sourceLink && (
            <a href={a.sourceLink} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-9 items-center gap-1 font-semibold text-violet hover:underline">
              Open conversation <ExternalLink aria-hidden className="size-3" />
            </a>
          )}
        </p>
      )}

      {a.status !== "done" && (
        <div className="mt-2 space-y-1.5 border-t border-line pt-2">
          <form key={`status-${a.status}-${a.blockedReason ?? ""}`} action={updateAction} className="flex flex-wrap gap-1.5">
            <input type="hidden" name="actionId" value={a.id} />
            <input type="hidden" name="op" value="status" />
            <select name="status" defaultValue={a.status} aria-label={`Status of "${a.title}"`} className={cn(input, "flex-1")}>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="waiting">Waiting on client</option>
              <option value="blocked">Blocked</option>
              {(needsReview(a) || a.status === "review") && <option value="review">Ready for review</option>}
              {!(mode === "developer" && needsReview(a)) && <option value="done">Done</option>}
            </select>
            <input name="reason" maxLength={200} defaultValue={a.blockedReason ?? ""} placeholder="If blocked: by what?" aria-label={`What is blocking "${a.title}"`} className={cn(input, "flex-[2]")} />
            <button type="submit" className={btn}>
              Save
            </button>
          </form>
          {mode === "manage" && a.status === "review" && <ReviewButtons a={a} />}
          {mode === "manage" && (
            <>
              <form key={`assign-${a.ownerId ?? ""}`} action={updateAction} className="flex gap-1.5">
                <input type="hidden" name="actionId" value={a.id} />
                <input type="hidden" name="op" value="assign" />
                <select name="ownerId" defaultValue={a.ownerId ?? ""} aria-label={`Reassign "${a.title}"`} className={cn(input, "flex-1")}>
                  <option value="">No one</option>
                  {staff.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className={btn}>
                  Reassign
                </button>
              </form>
              <details>
                <summary className="pressable inline-flex min-h-9 cursor-pointer list-none items-center text-xs font-semibold text-violet">Edit steps, time and link</summary>
                <form key={`details-${a.steps ?? ""}-${a.estMinutes ?? ""}-${a.sourceLink ?? ""}-${a.sourceNote ?? ""}`} action={updateAction} className="mt-1.5 space-y-1.5">
                  <input type="hidden" name="actionId" value={a.id} />
                  <input type="hidden" name="op" value="details" />
                  <textarea name="steps" rows={4} maxLength={2000} defaultValue={steps.join("\n")} placeholder="One step per line" aria-label="Steps" className={cn(input, "w-full py-1.5")} />
                  <div className="flex flex-wrap gap-1.5">
                    <select name="est" defaultValue={a.estMinutes && EST_OPTIONS.some(([v]) => v === a.estMinutes) ? String(a.estMinutes) : ""} aria-label="Time needed" className={cn(input, "flex-1")}>
                      <option value="">Time: not sure</option>
                      {EST_OPTIONS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input name="linkNote" maxLength={200} defaultValue={a.sourceNote ?? ""} placeholder="Where it came from" aria-label="Where it came from" className={cn(input, "flex-[2]")} />
                  </div>
                  <input name="link" type="url" maxLength={500} defaultValue={a.sourceLink ?? ""} placeholder="https://… GoHighLevel conversation link" aria-label="GoHighLevel conversation link" className={cn(input, "w-full")} />
                  <button type="submit" className={btn}>
                    Save details
                  </button>
                </form>
              </details>
              {canUseAi && a.kind !== "follow_up" && <WorkPromptButton actionId={a.id} />}
              {canCancel && <CancelForm a={a} />}
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function WorkOrderList({
  groups,
  today,
  mode,
  staff = [],
  canUseAi = false,
  canCancel = false,
  empty = "Nothing here.",
}: {
  groups: WorkOrderGroup[];
  today: string;
  mode: "manage" | "developer";
  staff?: { id: string; name: string }[];
  canUseAi?: boolean;
  /** The owner only (after 0013); the database refuses everyone else anyway. */
  canCancel?: boolean;
  empty?: string;
}) {
  if (!groups.length) return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">{empty}</p>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <section key={g.ownerId ?? "none"} aria-label={g.ownerName} className="glass rounded-3xl p-3">
          <h3 className="px-1">
            <span className={cn("block text-sm font-semibold", g.ownerId ? "" : "text-amber")}>{g.ownerName}</span>
            <StatsLine s={g.stats} />
          </h3>
          {g.items.length ? (
            <ul className="mt-2.5 space-y-2">
              {g.items.map((a) => (
                <ItemCard key={a.id} a={a} today={today} mode={mode} staff={staff} canUseAi={canUseAi} canCancel={canCancel} />
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 px-1 text-xs text-faint">Nothing matching the filter.</p>
          )}
        </section>
      ))}
    </div>
  );
}

/** Canceled work (owner only): newest first, with the reason and a Restore button. */
export function CanceledList({ items }: { items: ClientAction[] }) {
  if (!items.length) return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Nothing canceled.</p>;
  return (
    <ul className="glass divide-y divide-line rounded-3xl">
      {items.map((a) => (
        <li key={a.id} className="flex items-center gap-2 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-muted line-through decoration-faint">{a.title}</p>
            <p className="text-[11px] text-faint">
              {a.client?.name ?? "No client"} · {a.ownerName ?? "No one"} · canceled {a.canceledAt?.slice(0, 10) ?? ""}
              {a.cancelNote ? ` · ${a.cancelNote}` : ""}
            </p>
          </div>
          <form action={updateAction}>
            <input type="hidden" name="actionId" value={a.id} />
            <input type="hidden" name="op" value="restore" />
            <button type="submit" className={btn}>
              Restore
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
