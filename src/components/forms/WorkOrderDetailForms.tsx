"use client";

// Work order page forms (0017): comments, start date + links, hours, "Needs reassignment".
// Each posts to a server action that re-checks who you are; the database has the final say.
// A warning appears as soon as text looks like an email address or phone number.

import { useActionState, useState, type TextareaHTMLAttributes } from "react";
import { addWorkOrderComment, requestReassignment, saveActualHours, saveWorkOrderInfo } from "@/app/actions";
import { contactDetailsIn, MAX_LINKS } from "@/lib/work-orders";

const field = "min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink disabled:opacity-50";
const btn = "pressable min-h-11 shrink-0 rounded-xl bg-violet-deep px-4 text-sm font-semibold disabled:opacity-50";

type State = { error?: string; ok?: boolean } | undefined;

function Status({ state, ok }: { state: State; ok: string }) {
  if (state?.error) return <p role="alert" className="text-xs text-rose">{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-xs text-lime">{ok}</p>;
  return null;
}

/** A text box that warns when it looks like someone pasted contact details. */
export function ContactSafeTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [found, setFound] = useState<string[]>([]);
  return (
    <>
      <textarea
        {...props}
        onChange={(e) => {
          setFound(contactDetailsIn(e.target.value));
          props.onChange?.(e);
        }}
      />
      {found.length > 0 && (
        <p role="alert" className="mt-1 rounded-lg border border-amber/40 bg-amber/10 px-2 py-1 text-[11px] text-amber">
          This looks like {found.join(" and ")}. Keep contact details in the client record, not in work orders.
        </p>
      )}
    </>
  );
}

export function CommentForm({ actionId, disabled }: { actionId: string; disabled?: boolean }) {
  // n counts saved comments, so the box clears after each one.
  const [state, action, pending] = useActionState(async (prev: (State & { n?: number }) | undefined, fd: FormData) => {
    const r = await addWorkOrderComment(undefined, fd);
    return { ...r, n: (prev?.n ?? 0) + (r.ok ? 1 : 0) };
  }, undefined);
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="actionId" value={actionId} />
      <ContactSafeTextarea key={state?.n ?? 0} name="body" rows={3} maxLength={2000} required disabled={disabled || pending} placeholder="Add a comment…" aria-label="Comment" className={`${field} py-2`} />
      <div className="flex items-center justify-between gap-2">
        <Status state={state} ok="Comment added." />
        <button type="submit" disabled={disabled || pending} className={btn}>
          {pending ? "Adding…" : "Comment"}
        </button>
      </div>
    </form>
  );
}

export function InfoForm({ actionId, start, links, due }: { actionId: string; start: string | null; links: string[]; due: string | null }) {
  const [state, action, pending] = useActionState(saveWorkOrderInfo, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="actionId" value={actionId} />
      <label className="block text-[11px] text-muted">
        Start date
        <input type="date" name="start" defaultValue={start ?? ""} max={due ?? undefined} className={`${field} mt-1`} />
      </label>
      <label className="block text-[11px] text-muted">
        Links (Figma, site, docs): one per line, up to {MAX_LINKS}, https only
        <textarea name="links" rows={3} defaultValue={links.join("\n")} placeholder="https://" className={`${field} mt-1 py-2`} />
      </label>
      <div className="flex items-center justify-between gap-2">
        <Status state={state} ok="Saved." />
        <button type="submit" disabled={pending} className={btn}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function HoursForm({ actionId, minutes, disabled }: { actionId: string; minutes: number | null; disabled?: boolean }) {
  const [state, action, pending] = useActionState(saveActualHours, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="actionId" value={actionId} />
      <label className="min-w-0 flex-1 text-[11px] text-muted">
        Actual hours (optional)
        <input name="hours" inputMode="decimal" defaultValue={minutes === null ? "" : String(Math.round((minutes / 60) * 10) / 10)} placeholder="e.g. 1.5" disabled={disabled || pending} className={`${field} mt-1`} />
      </label>
      <button type="submit" disabled={disabled || pending} className={`${btn} self-end`}>
        {pending ? "Saving…" : "Save"}
      </button>
      <div className="w-full">
        <Status state={state} ok="Hours saved." />
      </div>
    </form>
  );
}

export function ReassignRequestForm({ actionId, disabled }: { actionId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(requestReassignment, undefined);
  if (state?.ok) return <p role="status" className="text-xs text-lime">Sent. The owner has been notified.</p>;
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="actionId" value={actionId} />
      <div className="flex gap-2">
        <input name="reason" required maxLength={200} placeholder="Why should someone else take it?" aria-label="Reason for reassignment" disabled={disabled || pending} className={field} />
        <button type="submit" disabled={disabled || pending} className="pressable min-h-11 shrink-0 rounded-xl border border-amber/50 bg-amber/10 px-3 text-sm font-semibold text-amber disabled:opacity-50">
          Ask
        </button>
      </div>
      <Status state={state} ok="" />
    </form>
  );
}
