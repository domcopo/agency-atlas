"use client";

// "Get heat map": shown when a run ended before LeadSnap finished the heat map. One tap reads
// it (no new credits) and adds it to the audit. All checks happen on the server.

import { Loader2, MapPinned } from "lucide-react";
import { useActionState } from "react";
import { fetchAuditHeatmap } from "@/app/actions";

export function FetchHeatMap({ id }: { id: string }) {
  const [state, action, pending] = useActionState(fetchAuditHeatmap, undefined);
  return (
    <form action={action} className="space-y-2 rounded-2xl border border-line p-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-xs text-muted">LeadSnap was still making this audit&apos;s heat map when the run ended. It usually takes a few minutes; getting it uses no new credits.</p>
      <button type="submit" disabled={pending} className="pressable inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold disabled:opacity-60">
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <MapPinned aria-hidden className="size-4" />}
        Get heat map
      </button>
      <p aria-live="polite" className="text-xs">
        {state?.ok ? <span className="text-lime">Added to the audit.</span> : state?.waiting ? <span className="text-amber">Not finished yet. Try again in a minute or two.</span> : state?.error ? <span className="text-rose">{state.error}</span> : null}
      </p>
    </form>
  );
}
