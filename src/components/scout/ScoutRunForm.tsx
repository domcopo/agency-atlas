"use client";

// New Scout run: where, what kinds, how many. Shows the estimate and what's left before
// anything starts; the server checks the caps again and the database enforces them.

import { useActionState, useState } from "react";
import { startScoutRun } from "@/app/actions";
import { runEstimate, SCOUT_KINDS, SCOUT_RULES } from "@/lib/scout";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";
const STARTERS = ["general contractor", "roofing contractor", "remodeler", "hvac contractor", "plumber", "electrician"];

export function ScoutRunForm({ left, defaultArea }: { left: number; defaultArea: string }) {
  const [state, action, pending] = useActionState(startScoutRun, undefined);
  const [size, setSize] = useState<number>(SCOUT_RULES.defaultRunSize);
  const est = runEstimate(size || 1);
  const over = est > left;
  return (
    <form action={action} className="space-y-4">
      <label className="block text-xs text-muted">
        Where to look
        <input name="area" required maxLength={200} defaultValue={defaultArea} className={field} />
        <span className="mt-1 block text-[11px] text-faint">Towns, counties or a radius from the office.</span>
      </label>
      <fieldset>
        <legend className="text-xs text-muted">Kinds of business (construction and home services to start)</legend>
        <div className="mt-1.5 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          {SCOUT_KINDS.map((k) => (
            <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="kind" value={k} defaultChecked={STARTERS.includes(k)} className="size-5 accent-violet" />
              <span className="capitalize">{k}</span>
            </label>
          ))}
        </div>
        <label className="mt-1 block text-xs text-muted">
          Another kind (optional)
          <input name="otherKind" maxLength={60} placeholder="e.g. fence contractor" className={field} />
        </label>
      </fieldset>
      <label className="block text-xs text-muted">
        How many businesses (most {SCOUT_RULES.maxRunSize})
        <input name="size" type="number" min={1} max={SCOUT_RULES.maxRunSize} value={size} onChange={(e) => setSize(Math.max(0, Math.min(SCOUT_RULES.maxRunSize, Number(e.target.value) || 0)))} className={field} />
      </label>
      <div className={`rounded-2xl border px-4 py-3 text-sm ${over ? "border-rose/40 bg-rose/5" : "border-line bg-white/[0.03]"}`}>
        <p>
          Estimated cost: <span className="font-semibold">${est.toFixed(2)}</span> · <span className={over ? "text-rose" : "text-muted"}>${left.toFixed(2)} left for you this month</span>
        </p>
        <p className="mt-1 text-[11px] text-faint">Starting a run sets aside this estimate under your Scout cap. The data is pulled in Claude Code with the prompt on the next screen, so nothing is spent until someone runs it.</p>
      </div>
      <button type="submit" disabled={pending || over || size < 1} className="pressable min-h-12 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-50">
        {pending ? "Starting…" : "Start the run"}
      </button>
      {state?.error && <p role="alert" className="text-sm text-rose">{state.error}</p>}
    </form>
  );
}
