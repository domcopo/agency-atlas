"use client";

// After a walk-in or call, one tap. Atlas only records THAT it happened (add-only); calls
// are dialed by hand from Google Maps. The note refuses phone numbers and emails.

import { useActionState, useState } from "react";
import { logScoutVisit } from "@/app/actions";
import { cn } from "@/lib/format";
import { VISIT_OUTCOMES } from "@/lib/scout";

const big = "pressable inline-flex min-h-12 items-center justify-center rounded-xl border px-3 text-sm font-semibold disabled:opacity-50";
const tone: Record<string, string> = {
  interested: "border-lime/40 bg-lime/10 text-lime",
  wants_audit: "border-teal/40 bg-teal/10 text-teal",
  not_interested: "border-line bg-white/5 text-muted",
  no_soliciting: "border-rose/40 bg-rose/5 text-rose",
  do_not_contact: "border-rose/40 bg-rose/5 text-rose",
};

export function VisitButtons({ prospectId }: { prospectId: string }) {
  const [state, action, pending] = useActionState(logScoutVisit, undefined);
  const [kind, setKind] = useState<"walk_in" | "call">("walk_in");
  const pill = (on: boolean) => cn("pressable flex min-h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold", on ? "bg-violet-deep text-ink" : "text-muted");
  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="prospectId" value={prospectId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="glass flex gap-1 rounded-2xl p-1" role="group" aria-label="Walk-in or call">
        <button type="button" className={pill(kind === "walk_in")} aria-pressed={kind === "walk_in"} onClick={() => setKind("walk_in")}>Walk-in</button>
        <button type="button" className={pill(kind === "call")} aria-pressed={kind === "call"} onClick={() => setKind("call")}>Call</button>
      </div>
      <input name="note" maxLength={200} placeholder="Short note, optional (no phone numbers or emails)" aria-label="Note" className="min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink" />
      <div className="grid grid-cols-2 gap-2">
        {VISIT_OUTCOMES.map((o) => (
          <button key={o.outcome} type="submit" name="outcome" value={o.outcome} disabled={pending} className={cn(big, tone[o.outcome] ?? "border-line bg-white/5")}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-faint">&quot;No soliciting&quot; and &quot;Do not contact&quot; hide this business for good, even in future runs.</p>
      {state?.ok && <p role="status" className="text-xs text-lime">Logged.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
