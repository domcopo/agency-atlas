"use client";

// Pause, mark lost, or bring back a client (owner or manager). Nothing is deleted: the
// client and all their history stay, and the change goes in a log nobody can edit.

import { useActionState, useState } from "react";
import { setClientStatus } from "@/app/actions";
import { STATUS_REASONS } from "@/lib/journey";
import type { SubscriptionStatus } from "@/lib/types";

const field = "mt-0.5 block min-h-10 w-full rounded-xl border border-line bg-white/5 px-2 text-sm text-ink";

export function ClientStatusForm({ clientId, slug, status, today }: { clientId: string; slug: string; status: SubscriptionStatus; today: string }) {
  const [state, action, pending] = useActionState(setClientStatus, undefined);
  const options = (["active", "paused", "lost"] as const).filter((o) => (o === "lost" ? status !== "canceled" : o !== status));
  const [to, setTo] = useState<(typeof options)[number]>(options[0]!);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="New status">
        {options.map((o) => (
          <label key={o} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-white/5 px-3 text-sm">
            <input type="radio" name="to" value={o} checked={to === o} onChange={() => setTo(o)} className="size-4 accent-violet-500" />
            {o === "active" ? "Back to active" : o === "paused" ? "Pause" : "Mark lost"}
          </label>
        ))}
      </div>
      {to !== "active" && (
        <label className="block text-[11px] text-muted">
          Why?
          <select name="reason" required defaultValue="" className={field}>
            <option value="" disabled>
              Pick a reason…
            </option>
            {STATUS_REASONS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
        <label className="block text-[11px] text-muted">
          Note (optional)
          <input name="note" maxLength={300} placeholder="What happened" className={field} />
        </label>
        {to !== "active" && (
          <label className="block text-[11px] text-muted">
            Since
            <input name="date" type="date" defaultValue={today} max={today} className={field} />
          </label>
        )}
      </div>
      <button type="submit" disabled={pending} className="pressable min-h-10 rounded-xl bg-violet-deep px-4 text-xs font-semibold disabled:opacity-60">
        {pending ? "Saving…" : to === "lost" ? "Mark lost" : to === "paused" ? "Pause client" : "Bring back"}
      </button>
      <p className="text-[11px] text-faint">Nothing is deleted. {to === "lost" ? "They move to Canceled & expired and count in Clients won & lost; the owner is told." : "Their history stays."}</p>
      {state?.error && (
        <p role="alert" className="text-xs text-rose">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-xs text-lime">
          Saved.
        </p>
      )}
    </form>
  );
}
