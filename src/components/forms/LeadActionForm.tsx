"use client";

// "Add a lead follow-up" on Sales. Saved in THIS app only; GoHighLevel is never changed.

import { useActionState } from "react";
import { createLeadAction } from "@/app/actions";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";

export function LeadActionForm({
  deals,
  staff,
  today,
  defaultLeadId,
}: {
  deals: { ghlId: string; label: string }[];
  staff: { id: string; name: string }[];
  today: string;
  defaultLeadId?: string;
}) {
  const [state, action, pending] = useActionState(createLeadAction, undefined);
  return (
    <form action={action} className="space-y-2.5">
      <label className="block text-xs text-muted">
        Lead
        <select name="leadId" required defaultValue={defaultLeadId ?? ""} className={field}>
          <option value="" disabled>
            Pick a lead…
          </option>
          {deals.map((d) => (
            <option key={d.ghlId} value={d.ghlId}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-muted">
        Next step
        <input name="title" required maxLength={120} placeholder="e.g. Call back about the proposal" className={field} />
      </label>
      <div className={staff.length ? "grid grid-cols-2 gap-2" : ""}>
        {staff.length > 0 && (
        <label className="block text-xs text-muted">
          Owner
          <select name="ownerId" defaultValue="" className={field}>
            <option value="">No owner yet</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        )}
        <label className="block text-xs text-muted">
          Due
          <input name="due" type="date" defaultValue={today} className={field} />
        </label>
      </div>
      <input type="hidden" name="priority" value="normal" />
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Add follow-up"}
      </button>
      {state?.ok && <p role="status" className="text-xs text-lime">{staff.length ? "Saved. It's on the owner's list." : "Saved. It's on your list."}</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
