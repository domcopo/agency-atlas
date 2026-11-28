// One compact row on the Work list (about 48 px on a computer, two lines on a phone):
// Done box, priority dot, title, client, owner, real due date with a hint, status, "⋯".
// The Done box offers Undo afterwards (UndoToast.tsx). Every other button is a plain form
// posting to the existing server actions (updateAction,
// moveToTrash); the server re-checks who you are and the database has the final say.

import { Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { updateAction } from "@/app/actions";
import { priorityTone } from "@/components/cards/ActionRow";
import { CancelForm, DetailsForm, ReviewButtons } from "@/components/cards/WorkOrderList";
import { EditItemForm } from "@/components/forms/EditItemForm";
import { MoveToTrashButton } from "@/components/forms/TrashForms";
import { WorkPromptButton } from "@/components/forms/WorkPromptButton";
import { RowMenu } from "@/components/work/RowMenu";
import { DoneBox } from "@/components/work/UndoToast";
import { clientLabel } from "@/lib/agency";
import { cn } from "@/lib/format";
import { kindLabel, promiseMissed } from "@/lib/ops";
import type { ClientAction } from "@/lib/types";
import { dueHint, initials, isOverdue } from "@/lib/work-hub";
import { STATUS_WORD } from "@/lib/work-orders";

const STATUS_TONE: Record<ClientAction["status"], string> = {
  open: "border-line text-muted",
  in_progress: "border-teal/40 text-teal",
  waiting: "border-sky/40 text-sky",
  blocked: "border-rose/50 bg-rose/10 text-rose",
  review: "border-violet/50 text-violet",
  done: "border-lime/40 text-lime",
  canceled: "border-line text-faint",
};

const DUE_TONE = { late: "font-semibold text-rose", today: "font-semibold text-amber", soon: "text-ink", later: "text-muted", none: "text-faint" } as const;

const input = "min-h-10 min-w-0 rounded-lg border border-line bg-white/5 px-2 text-sm text-ink";
const btn = "pressable min-h-10 shrink-0 rounded-lg border border-line bg-white/5 px-3 text-sm font-semibold";
const section = "border-t border-line px-1 py-2 first:border-t-0";
const heading = "mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted";

export interface RowProps {
  a: ClientAction;
  today: string;
  staff: { id: string; name: string }[];
  /** Signed in (owner or manager). Off in the sample demo: look only. */
  canEdit: boolean;
  canUseAi: boolean;
  /** The owner only (after 0013); the database refuses everyone else. */
  canCancel: boolean;
  /** A lead follow-up's lead name, when there's no client. */
  leadName?: string;
  /** The address that opens this item in the drawer (keeps the filters). */
  openHref: (id: string) => string;
  /** The item open in the drawer right now. */
  openId?: string;
}

function Hidden({ a, op }: { a: ClientAction; op: string }) {
  return (
    <>
      <input type="hidden" name="actionId" value={a.id} />
      <input type="hidden" name="op" value={op} />
    </>
  );
}

export function WorkRow({ a, today, staff, canEdit, canUseAi, canCancel, leadName, openHref, openId }: RowProps) {
  // Red is kept for late and blocked work, so an urgent dot is orange here.
  const tone = a.priority === "critical" ? { ...priorityTone.critical, label: "Urgent", dot: "bg-due-orange" } : priorityTone[a.priority];
  const due = dueHint(a.dueOn, today);
  const missed = promiseMissed(a, today);
  const late = isOverdue(a, today);
  const where = a.client || a.internal ? clientLabel(a) : leadName ? `Lead: ${leadName}` : "No client";
  const done = a.status === "done";
  const selected = openId === a.id;
  const title = (
    <Link href={openHref(a.id)} scroll={false} data-row-open aria-current={selected ? "true" : undefined} className="hover:underline">
      {a.title}
    </Link>
  );

  return (
    <li
      id={`wo-${a.id}`}
      data-hub-row
      className={cn(
        "group/row grid scroll-mt-24 grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-x-2 border-t border-line px-2 py-2 first:border-t-0 hover:bg-white/[0.03] focus-within:bg-white/[0.05] @3xl:min-h-11 @3xl:grid-cols-[36px_minmax(0,1fr)_minmax(0,11rem)_8.5rem_9.5rem_8rem_36px] @3xl:gap-x-3 @3xl:py-0",
        selected && "bg-violet/[0.12] shadow-[inset_3px_0_0_var(--color-violet)]",
      )}
    >
      {/* Done box: one tap. Items in review are approved instead (same as "Approve as done"). */}
      {canEdit && !done ? (
        <DoneBox id={a.id} title={a.title} status={a.status} reason={a.blockedReason ?? null} />
      ) : (
        <span className="flex justify-center" aria-hidden>
          <span className={cn("flex size-5 items-center justify-center rounded-md border-2", done ? "border-lime bg-lime/20" : "border-line")}>{done && <Check className="size-3.5 text-lime" />}</span>
        </span>
      )}

      {/* Title (and, on a phone, the details underneath). */}
      <div className="min-w-0 py-1 @3xl:py-0">
        <p className="flex min-w-0 items-center gap-2">
          <span className={cn("size-2.5 shrink-0 rounded-full", tone.dot)} title={`${tone.label} priority`} aria-label={`${tone.label} priority`} role="img" />
          <span className={cn("truncate text-sm font-semibold", done && "text-muted line-through decoration-faint")}>{title}</span>
          {a.kind !== "work_order" && <span className="hidden shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted xl:inline">{kindLabel(a.kind)}</span>}
        </p>
        {(a.status === "blocked" || missed || (a.reviewNote && a.status !== "review" && !done)) && (
          <p className="truncate pl-[18px] text-xs">
            {a.status === "blocked" && <span className="text-rose">Blocked: {a.blockedReason || "no reason given"}</span>}
            {missed && <span className="font-semibold text-rose">{a.status === "blocked" ? " · " : ""}Promise to client missed ({a.promisedOn})</span>}
            {a.reviewNote && a.status !== "review" && !done && <span className="text-amber">{a.status === "blocked" || missed ? " · " : ""}Sent back: {a.reviewNote}</span>}
          </p>
        )}
        {/* Phone: client · owner · due · status on one line under the title. */}
        <p className="truncate pl-[18px] text-xs text-muted @3xl:hidden">
          {where} · {a.ownerName ?? <span className="font-semibold text-amber">Unassigned</span>} · <span className={DUE_TONE[due.tone]}>{done ? `Done ${a.doneAt?.slice(0, 10) ?? ""}` : due.text}</span>
          {a.status !== "open" && !done && <span className={a.status === "blocked" ? "text-rose" : ""}> · {STATUS_WORD[a.status]}</span>}
        </p>
      </div>

      {/* Computer columns: client, owner, due, status. */}
      <p className="hidden truncate text-sm text-muted @3xl:block">
        {a.client ? (
          <Link href={`/clients/${a.client.slug}`} className="hover:text-ink hover:underline">
            {where}
          </Link>
        ) : (
          where
        )}
      </p>
      <p className="hidden min-w-0 items-center gap-2 @3xl:flex">
        {a.ownerName ? (
          <>
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet/20 text-[11px] font-bold text-ink">
              {initials(a.ownerName)}
            </span>
            <span className="truncate text-sm text-muted">{a.ownerName}</span>
          </>
        ) : (
          <span className="rounded-full border border-amber/50 bg-amber/10 px-2 py-0.5 text-xs font-semibold text-amber">Unassigned</span>
        )}
      </p>
      <p className={cn("hidden truncate text-sm @3xl:block", done ? "text-lime" : late && due.tone !== "late" ? "font-semibold text-rose" : DUE_TONE[due.tone])} title={a.dueOn ?? undefined}>
        {done ? `Done ${a.doneAt?.slice(5, 10).replace("-", "/") ?? ""}` : due.text}
      </p>
      <p className="hidden @3xl:block">
        <span className={cn("inline-block max-w-full truncate rounded-full border px-3 py-0.5 text-xs font-semibold", STATUS_TONE[a.status])}>{STATUS_WORD[a.status]}</span>
      </p>

      {canEdit && !done ? (
        <RowMenu label={`More for "${a.title}"`}>
          <div className={section}>
            <p className={heading}>Status</p>
            <div className="flex flex-wrap gap-2">
              {(["open", "in_progress", "waiting"] as const)
                .filter((s) => s !== a.status)
                .map((s) => (
                  <form key={s} action={updateAction}>
                    <Hidden a={a} op="status" />
                    <input type="hidden" name="status" value={s} />
                    <button type="submit" className={btn}>
                      {STATUS_WORD[s]}
                    </button>
                  </form>
                ))}
            </div>
          </div>
          {a.status === "review" && (
            <div className={section}>
              <ReviewButtons a={a} />
            </div>
          )}
          <div className={section}>
            <p className={heading}>Reschedule</p>
            <div className="flex flex-wrap gap-2">
              {(["tomorrow", "week"] as const).map((p) => (
                <form key={p} action={updateAction}>
                  <Hidden a={a} op="reschedule" />
                  <input type="hidden" name="preset" value={p} />
                  <button type="submit" className={btn}>
                    {p === "tomorrow" ? "Tomorrow" : "Next week"}
                  </button>
                </form>
              ))}
              <form action={updateAction} className="flex min-w-0 flex-1 gap-2">
                <Hidden a={a} op="reschedule" />
                <input type="date" name="due" required defaultValue={a.dueOn ?? ""} aria-label="New due date" className={cn(input, "flex-1")} />
                <button type="submit" className={btn}>
                  Set
                </button>
              </form>
            </div>
            <form key={`promise-${a.promisedOn ?? ""}`} action={updateAction} className="mt-2 flex flex-wrap items-center gap-2">
              <Hidden a={a} op="promise" />
              <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
                Promised to client by
                <input type="date" name="promised" defaultValue={a.promisedOn ?? ""} className={cn(input, "flex-1")} />
              </label>
              <button type="submit" className={btn}>
                Save
              </button>
            </form>
          </div>
          <div className={section}>
            <p className={heading}>Assign</p>
            <form key={`assign-${a.ownerId ?? ""}`} action={updateAction} className="flex gap-2">
              <Hidden a={a} op="assign" />
              <select name="ownerId" defaultValue={a.ownerId ?? ""} aria-label={`Assign "${a.title}"`} className={cn(input, "flex-1")}>
                <option value="">No one</option>
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
          </div>
          <div className={section}>
            <p className={heading}>{a.status === "blocked" ? "Blocked on" : "Mark blocked"}</p>
            <form key={`blocked-${a.blockedReason ?? ""}`} action={updateAction} className="flex gap-2">
              <Hidden a={a} op="status" />
              <input type="hidden" name="status" value="blocked" />
              <input name="reason" maxLength={200} required defaultValue={a.blockedReason ?? ""} placeholder="Blocked on what?" aria-label={`What is blocking "${a.title}"`} className={cn(input, "flex-1")} />
              <button type="submit" className={cn(btn, "border-rose/40 text-rose")}>
                {a.status === "blocked" ? "Save" : "Blocked"}
              </button>
            </form>
          </div>
          <div className={cn(section, "space-y-1")}>
            <p className={heading}>Edit</p>
            <details>
              <summary className="pressable inline-flex min-h-9 cursor-pointer list-none items-center text-xs font-semibold text-violet">Edit title and notes</summary>
              <div className="mt-2">
                <EditItemForm key={`${a.title}-${a.notes ?? ""}`} actionId={a.id} title={a.title} notes={a.notes} />
              </div>
            </details>
            <DetailsForm a={a} />
            {a.sourceLink && (
              <a href={a.sourceLink} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-violet hover:underline">
                Open GoHighLevel conversation <ExternalLink aria-hidden className="size-3" />
              </a>
            )}
            {canUseAi && a.kind !== "follow_up" && <WorkPromptButton actionId={a.id} />}
            {a.kind === "work_order" && (
              <p>
                <Link href={`/work/orders/${a.id}`} className="inline-flex min-h-9 items-center text-xs font-semibold text-violet hover:underline">
                  Open full page: comments, history, links, hours ›
                </Link>
              </p>
            )}
          </div>
          <div className={cn(section, "space-y-1")}>
            {canCancel && <CancelForm a={a} />}
            <MoveToTrashButton kind="item" id={a.id} what={`"${a.title}"`} />
          </div>
        </RowMenu>
      ) : (
        <span aria-hidden />
      )}
    </li>
  );
}
