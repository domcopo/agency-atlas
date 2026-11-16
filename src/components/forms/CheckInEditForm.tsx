"use client";

// Fix a logged check-in (owner and managers, 0021): date, type, mood, note. Or remove it:
// it's hidden, not deleted, and stops counting; the owner can restore it. The database
// keeps every old value and who changed it.

import { useActionState } from "react";
import { editCheckIn, setCheckInRemoved } from "@/app/actions";
import type { EditableCheckIn } from "@/lib/types";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";
const KINDS = [
  ["check_in", "Check-in"],
  ["call", "Call"],
  ["message", "Message"],
  ["email", "Email"],
  ["meeting", "Meeting"],
  ["note", "Note"],
] as const;

export function CheckInEditForm({ checkIn, slug, today }: { checkIn: EditableCheckIn; slug: string; today: string }) {
  const [state, action, pending] = useActionState(editCheckIn, undefined);
  return (
    <div className="space-y-2">
      <form action={action} className="space-y-2">
        <input type="hidden" name="checkInId" value={checkIn.id} />
        <input type="hidden" name="slug" value={slug} />
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-muted">
            Date
            <input name="date" type="date" required max={today} defaultValue={checkIn.date} className={field} />
          </label>
          <label className="block text-[11px] text-muted">
            Type
            <select name="kind" defaultValue={checkIn.kind} className={field}>
              {KINDS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-[11px] text-muted">
          How were they doing?
          <select name="mood" defaultValue={checkIn.mood ?? ""} className={field}>
            <option value="">Not said</option>
            <option value="better">Better</option>
            <option value="same">Same</option>
            <option value="worse">Worse</option>
          </select>
        </label>
        <label className="block text-[11px] text-muted">
          Note
          <input name="note" maxLength={500} defaultValue={checkIn.note ?? ""} className={field} />
        </label>
        <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state?.ok && <p role="status" className="text-xs text-lime">Saved. The old version is kept in the change record.</p>}
        {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
      </form>
      <form action={setCheckInRemoved}>
        <input type="hidden" name="checkInId" value={checkIn.id} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="op" value="remove" />
        <button type="submit" className="pressable min-h-11 w-full rounded-xl border border-rose/40 bg-rose/10 text-sm font-semibold text-rose">
          Remove this check-in
        </button>
      </form>
      <p className="text-[11px] text-faint">Removed check-ins stop counting for health and last contact. The owner can restore them.</p>
    </div>
  );
}
