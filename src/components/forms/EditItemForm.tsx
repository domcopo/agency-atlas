"use client";

// "Edit" on a work order, follow-up or issue: fix the title and notes (owner and managers).
// The server re-checks who you are; the database refuses developers and keeps the history.

import { useActionState } from "react";
import { editActionText } from "@/app/actions";

const field = "min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";

export function EditItemForm({ actionId, title, notes, slug }: { actionId: string; title: string; notes: string | null; slug?: string }) {
  const [state, action, pending] = useActionState(editActionText, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="actionId" value={actionId} />
      {slug && <input type="hidden" name="slug" value={slug} />}
      <label className="block text-[11px] text-muted">
        Title
        <input name="title" required maxLength={120} defaultValue={title} className={`${field} mt-1`} />
      </label>
      <label className="block text-[11px] text-muted">
        Notes (optional)
        <textarea name="notes" rows={2} maxLength={500} defaultValue={notes ?? ""} className={`${field} mt-1 py-2`} />
      </label>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-faint">The old wording stays in the history.</p>
        <button type="submit" disabled={pending} className="pressable min-h-11 shrink-0 rounded-xl bg-violet-deep px-4 text-sm font-semibold disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {state?.ok && <p role="status" className="text-xs text-lime">Saved.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
