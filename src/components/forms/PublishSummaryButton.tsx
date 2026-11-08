"use client";

// "Publish now": saves a fresh owner summary (totals only) for your personal dashboard.
// Nothing is sent anywhere; the dashboard reads it with its key.

import { useActionState } from "react";
import { publishOwnerSummaryNow } from "@/app/actions";

export function PublishSummaryButton() {
  const [state, action, pending] = useActionState(publishOwnerSummaryNow, undefined);
  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-white/10 text-sm font-semibold disabled:opacity-60">
        {pending ? "Publishing…" : "Publish now"}
      </button>
      {state?.message && <p role="status" className="text-xs text-lime">{state.message}</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
