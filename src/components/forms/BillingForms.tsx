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

/**
 * Match by hand. When Atlas found a client with exactly the same name, it offers that one
 * first ("Yes, that's them"); nothing is saved until the owner taps.
 */
export function MatchBillingForm({
  contactId,
  clients,
  suggested,
}: {
  contactId: string;
  clients: { slug: string; name: string }[];
  suggested?: { slug: string; name: string } | null;
}) {
  if (!suggested) return <PickClientForm contactId={contactId} clients={clients} />;
  return (
    <div className="mt-2 space-y-1.5">
      <ConfirmSuggestion contactId={contactId} suggested={suggested} />
      <details>
        <summary className="pressable inline-flex min-h-10 cursor-pointer list-none items-center text-xs text-muted underline-offset-2 hover:underline">Someone else?</summary>
        <PickClientForm contactId={contactId} clients={clients} />
      </details>
    </div>
  );
}

function ConfirmSuggestion({ contactId, suggested }: { contactId: string; suggested: { slug: string; name: string } }) {
  const [state, action, pending] = useActionState(matchBillingContact, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-xl border border-violet/30 bg-violet/5 p-2">
      <input type="hidden" name="contact_id" value={contactId} />
      <input type="hidden" name="client" value={suggested.slug} />
      <span className="min-w-0 flex-1 text-xs">
        Same name as your client <span className="font-semibold">{suggested.name}</span>
      </span>
      <button type="submit" disabled={pending || Boolean(state?.message)} className="pressable min-h-11 rounded-xl bg-violet-deep px-3 text-xs font-semibold disabled:opacity-60">
        {pending ? "Matching…" : state?.message ? "Matched" : "Yes, that's them"}
      </button>
      {state?.message && <p role="status" className="w-full text-xs text-lime">{state.message}</p>}
      {state?.error && <p role="alert" className="w-full text-xs text-rose">{state.error}</p>}
    </form>
  );
}

function PickClientForm({ contactId, clients }: { contactId: string; clients: { slug: string; name: string }[] }) {
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
