"use client";

// One tap after reaching out to a lead: Called / Texted / Emailed / Met / Walk-in.
// Atlas only records THAT it happened (add-only); the call or text itself happens in
// GoHighLevel. The optional note refuses email addresses and phone numbers.
// size "big" (the lead page) uses the same large buttons as the developer screens.

import { useActionState, useState } from "react";
import { logLeadTouch } from "@/app/actions";
import { cn } from "@/lib/format";
import { TOUCH_KINDS } from "@/lib/sales";

const small = "pressable min-h-10 rounded-xl border border-line bg-white/5 px-2.5 text-xs font-semibold disabled:opacity-50";
const big = "pressable inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-white/5 px-3 text-sm font-semibold disabled:opacity-50";

export function TouchButtons({ leadId, size = "small" }: { leadId: string; size?: "small" | "big" }) {
  const [state, action, pending] = useActionState(logLeadTouch, undefined);
  const [withNote, setWithNote] = useState(size === "big");
  const btn = size === "big" ? big : small;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      {withNote && (
        <input
          name="note"
          maxLength={200}
          placeholder="Short note, optional (no phone numbers or emails)"
          aria-label="Note"
          className={cn("w-full rounded-xl border border-line bg-white/5 px-3 text-ink", size === "big" ? "min-h-11 text-sm" : "min-h-10 text-xs")}
        />
      )}
      <div className={size === "big" ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-1.5"}>
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
      {state?.ok && <p role="status" className="text-xs text-lime">Logged.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
