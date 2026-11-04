"use client";

import { useActionState } from "react";
import { syncFromGhl } from "@/app/actions";

/** Owner-only: reads from GoHighLevel and saves copies in this app's database. */
export function SyncButton() {
  const [state, action, pending] = useActionState(syncFromGhl, undefined);
  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Reading from GoHighLevel…" : "Sync from GoHighLevel (read-only)"}
      </button>
      {state?.message && <p role="status" className="text-xs text-lime">{state.message}</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
