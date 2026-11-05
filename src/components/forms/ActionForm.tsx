"use client";

// "Add next action" on a client's page: a follow-up or an issue, with owner,
// due date and priority. Saves to YOUR database only (never GoHighLevel).

import { useActionState, useState } from "react";
import { createAction } from "@/app/actions";
import { cn } from "@/lib/format";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";

export function ActionForm({
  clientId,
  slug,
  today,
  staff,
  defaultOwnerId,
}: {
  clientId: string;
  slug: string;
  today: string;
  staff: { id: string; name: string }[];
  defaultOwnerId?: string;
}) {
  const [state, action, pending] = useActionState(createAction, undefined);
  const [kind, setKind] = useState<"follow_up" | "issue">("follow_up");
  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type">
        {(
          [
            ["follow_up", "Follow-up"],
            ["issue", "Issue"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={kind === id}
            onClick={() => setKind(id)}
            className={cn(
              "pressable min-h-11 rounded-xl border text-sm font-semibold",
              kind === id ? "border-violet/60 bg-violet/15 text-ink" : "border-line bg-white/5 text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="block text-xs text-muted">
        {kind === "issue" ? "What's the problem?" : "What needs to happen next?"}
        <input
          name="title"
          required
          maxLength={120}
          placeholder={kind === "issue" ? "e.g. Landing page tracking not firing" : "e.g. Review ad results with the client"}
          className={field}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-muted">
          Owner
          <select name="ownerId" defaultValue={defaultOwnerId ?? ""} className={field}>
            <option value="">No owner yet</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Due
          <input name="due" type="date" defaultValue={today} className={field} />
        </label>
      </div>
      <label className="block text-xs text-muted">
        Priority
        <select name="priority" defaultValue="normal" className={field}>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label className="block text-xs text-muted">
        Notes (optional)
        <input name="notes" maxLength={500} className={field} />
      </label>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : kind === "issue" ? "Open issue" : "Add next action"}
      </button>
      {state?.ok && <p role="status" className="text-xs text-lime">Saved.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
