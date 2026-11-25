"use client";

// Safety page, owner only: BizToad on/off for everyone, which roles may ask (Phase 3), and
// its two monthly caps (0030). The database refuses changes from anyone but the owner, and
// checks the limits and role names too. The owner can always ask.

import { useActionState } from "react";
import { setToadSettings } from "@/app/actions";

const ASKERS = [
  { role: "manager", label: "Managers" },
  { role: "developer", label: "Developers (their own work only)" },
  { role: "sales", label: "Salespeople (their own leads only)" },
] as const;

export function ToadSettingsForm({ enabled, roles, monthlyUsd, perPersonUsd }: { enabled: boolean; roles: string[]; monthlyUsd: number; perPersonUsd: number }) {
  const [state, action, pending] = useActionState(setToadSettings, undefined);
  const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";
  return (
    <form action={action} className="space-y-2 rounded-2xl border border-line p-3">
      <p className="text-sm font-semibold">BizToad</p>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input name="enabled" type="checkbox" defaultChecked={enabled} className="size-5 accent-violet-deep" />
        On for everyone (off hides the toad for the whole team)
      </label>
      <fieldset className="space-y-0.5">
        <legend className="text-xs text-muted">Who can ask questions (you always can)</legend>
        {ASKERS.map((a) => (
          <label key={a.role} className="flex min-h-11 items-center gap-2 text-sm">
            <input name="roles" value={a.role} type="checkbox" defaultChecked={roles.includes(a.role)} className="size-5 accent-violet-deep" />
            {a.label}
          </label>
        ))}
        <p className="text-[11px] text-faint">Tip: switch on one role at a time and try a few questions first.</p>
      </fieldset>
      <div className="flex gap-2">
        <label className="flex-1 text-xs text-muted">
          Team total a month (US $)
          <input name="monthly_usd" type="number" min={0} max={200} step={1} defaultValue={monthlyUsd} required className={field} />
        </label>
        <label className="flex-1 text-xs text-muted">
          Per person a month (US $)
          <input name="per_person_usd" type="number" min={0} max={50} step={0.5} defaultValue={perPersonUsd} required className={field} />
        </label>
      </div>
      <p className="text-[11px] text-faint">Counts inside the monthly AI budget above. About 3–5¢ a question.</p>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-white/10 px-4 text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Save BizToad settings"}
      </button>
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
      {state?.ok && <p role="status" className="text-xs text-lime">Saved.</p>}
    </form>
  );
}
