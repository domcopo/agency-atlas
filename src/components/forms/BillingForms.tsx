"use client";

// Billing (0015), owner only: refresh (read-only from GoHighLevel) and match a billing
// contact to a client by hand. The server and the database both check it's the owner.

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { matchBillingContact, syncBilling } from "@/app/actions";

export function RefreshBillingButton({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(async () => syncBilling(), undefined);
  return (
    <form action={action} className="space-y-2">
      <button
        type="submit"
        disabled={pending || disabled}
        className="pressable inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60"
      >
        <RefreshCw aria-hidden className={`size-4 ${pending ? "motion-safe:animate-spin" : ""}`} />
        {pending ? "Reading from GoHighLevel…" : "Refresh billing (read-only)"}
      </button>
      {state?.message && <p role="status" className="text-xs text-lime">{state.message}</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}

export function MatchBillingForm({ contactId, clients }: { contactId: string; clients: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState(matchBillingContact, undefined);
  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="contact_id" value={contactId} />
      <label className="min-w-0 flex-1 text-xs text-muted">
        <span className="sr-only">Client</span>
        <select name="client" required defaultValue="" className="min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink">
          <option value="" disabled>
            Pick the client…
          </option>
          {clients.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className="pressable min-h-11 rounded-xl border border-violet/40 bg-violet/10 px-3 text-xs font-semibold disabled:opacity-60">
        {pending ? "Matching…" : "Match"}
      </button>
      {state?.message && <p role="status" className="w-full text-xs text-lime">{state.message}</p>}
      {state?.error && <p role="alert" className="w-full text-xs text-rose">{state.error}</p>}
    </form>
  );
}
