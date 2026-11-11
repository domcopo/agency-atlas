"use client";

// Mute notice kinds for myself only. In-app notices only: Atlas never texts or emails.
import { useActionState } from "react";
import { saveNoticeMutes } from "@/app/actions";

export function NoticeMutesForm({ kinds, muted }: { kinds: { kind: string; label: string }[]; muted: string[] }) {
  const [state, action, pending] = useActionState(saveNoticeMutes, undefined);
  return (
    <form action={action} className="glass space-y-1 rounded-3xl p-4">
      {kinds.map((k) => (
        <label key={k.kind} className="flex min-h-11 items-center justify-between gap-3 text-sm">
          <span>{k.label}</span>
          <span className="flex items-center gap-2 text-xs text-muted">
            Mute
            <input type="checkbox" name="muted" value={k.kind} defaultChecked={muted.includes(k.kind)} className="size-5 accent-violet-deep" />
          </span>
        </label>
      ))}
      <div className="flex items-center justify-between gap-2 pt-2">
        {state?.error ? <p role="alert" className="text-xs text-rose">{state.error}</p> : state?.ok ? <p role="status" className="text-xs text-lime">Saved.</p> : <span />}
        <button type="submit" disabled={pending} className="pressable min-h-11 rounded-xl bg-violet-deep px-4 text-sm font-semibold disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
