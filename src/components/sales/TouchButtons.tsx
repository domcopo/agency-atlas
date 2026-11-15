"use client";

// One tap after reaching out to a lead: Called / Texted / Emailed / Met / Walk-in.
// Atlas only records THAT it happened (add-only); the call or text itself happens in
// GoHighLevel. The optional note refuses email addresses and phone numbers.

import { useActionState, useState } from "react";
import { logLeadTouch } from "@/app/actions";
import { TOUCH_KINDS } from "@/lib/sales";

const btn = "pressable min-h-10 rounded-xl border border-line bg-white/5 px-2.5 text-xs font-semibold disabled:opacity-50";

export function TouchButtons({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(logLeadTouch, undefined);
  const [withNote, setWithNote] = useState(false);
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="leadId" value={leadId} />
      {withNote && (
        <input
          name="note"
          maxLength={200}
          placeholder="Short note (no phone numbers or emails)"
          aria-label="Note"
          className="min-h-10 w-full rounded-xl border border-line bg-white/5 px-3 text-xs text-ink"
        />
      )}
      <div className="flex flex-wrap gap-1.5">
        {TOUCH_KINDS.filter((k) => k.kind !== "other").map((k) => (
          <button key={k.kind} type="submit" name="kind" value={k.kind} disabled={pending} className={btn}>
            {k.label}
          </button>
        ))}
        {!withNote && (
          <button type="button" onClick={() => setWithNote(true)} className={`${btn} text-faint`}>
            + note
          </button>
        )}
      </div>
      {state?.ok && <p role="status" className="text-[11px] text-lime">Logged.</p>}
      {state?.error && <p role="alert" className="text-[11px] text-rose">{state.error}</p>}
    </form>
  );
}
