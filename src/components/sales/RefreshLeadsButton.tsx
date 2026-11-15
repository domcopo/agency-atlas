"use client";

// "Refresh leads": reads the sales pipelines from GoHighLevel (read-only) and updates
// Atlas's copy. At most once every 10 minutes for everyone (the database enforces it).

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { refreshLeads } from "@/app/actions";

export function RefreshLeadsButton({ lastLabel }: { lastLabel: string }) {
  const [state, action, pending] = useActionState(refreshLeads, undefined);
  return (
    <form action={action} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-white/5 px-3 text-sm font-semibold disabled:opacity-60">
          <RefreshCw aria-hidden className={`size-4 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} />
          {pending ? "Reading GoHighLevel…" : "Refresh leads"}
        </button>
        <span className="text-[11px] text-faint">{lastLabel}</span>
      </div>
      {state?.message && <p role="status" className="text-xs text-lime">{state.message}</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
