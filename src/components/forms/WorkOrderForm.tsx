"use client";

// Add a work order: client, what to do, steps, who, when, and (optionally) the
// GoHighLevel conversation it came from. Also used to add an AI draft after a person
// reviews and edits it. Saves to YOUR database only; GoHighLevel is never changed.

import { useActionState } from "react";
import { createWorkOrder } from "@/app/actions";
import { ContactSafeTextarea } from "@/components/forms/WorkOrderDetailForms";
import { EST_OPTIONS } from "@/lib/ops";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";


export interface WorkOrderDefaults {
  slug?: string;
  title?: string;
  steps?: string;
  priority?: string;
  ownerId?: string;
  est?: number | null;
  notes?: string;
}

/** Nearest estimate choice (AI estimates can be any number). */
function nearestEst(min: number | null | undefined): string {
  if (!min) return "";
  return String(EST_OPTIONS.reduce((best, [v]) => (Math.abs(v - min) < Math.abs(best - min) ? v : best), EST_OPTIONS[0][0] as number));
}

export function WorkOrderForm({
  clients,
  staff,
  today,
  defaults = {},
  fromDraft = false,
  submitLabel = "Add work order",
}: {
  clients: { slug: string; name: string }[];
  staff: { id: string; name: string }[];
  today: string;
  defaults?: WorkOrderDefaults;
  fromDraft?: boolean;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState(createWorkOrder, undefined);
  if (state?.ok && fromDraft) return <p role="status" className="text-xs font-semibold text-lime">Added to work orders.</p>;
  return (
    <form action={action} className="space-y-2.5">
      {fromDraft && <input type="hidden" name="fromDraft" value="1" />}
      <label className="block text-xs text-muted">
        Client
        <select name="slug" required defaultValue={defaults.slug ?? ""} className={field}>
          <option value="" disabled>
            Pick a client
          </option>
          {clients.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-muted">
        What needs to be done?
        <input name="title" required maxLength={120} defaultValue={defaults.title} placeholder="e.g. Fix mobile speed on the homepage" className={field} />
      </label>
      <label className="block text-xs text-muted">
        Steps (one per line, optional)
        <ContactSafeTextarea
          name="steps"
          rows={4}
          maxLength={2000}
          defaultValue={defaults.steps}
          placeholder={"Run PageSpeed on mobile\nCompress the hero image\nRe-test and note the new score"}
          className={`${field} py-2`}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-muted">
          Assigned to
          <select name="ownerId" defaultValue={defaults.ownerId ?? ""} className={field}>
            <option value="">No one yet</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Time needed
          <select name="est" defaultValue={nearestEst(defaults.est)} className={field}>
            <option value="">Not sure</option>
            {EST_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Due
          <input name="due" type="date" defaultValue={today} className={field} />
        </label>
        <label className="block text-xs text-muted">
          Priority
          <select name="priority" defaultValue={defaults.priority ?? "normal"} className={field}>
            <option value="critical">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>
      <details className="rounded-xl border border-line px-3 py-1">
        <summary className="pressable flex min-h-10 cursor-pointer list-none items-center text-xs font-semibold text-violet">More: promise date, GoHighLevel link, notes</summary>
        <div className="space-y-2.5 pb-2">
          <label className="block text-xs text-muted">
            Promised to the client by (optional)
            <input name="promised" type="date" className={field} />
          </label>
          <label className="block text-xs text-muted">
            GoHighLevel conversation link (optional)
            <input name="link" type="url" inputMode="url" maxLength={500} placeholder="https://… (copy from the conversation in GoHighLevel)" className={field} />
            <span className="mt-0.5 block text-[11px] text-faint">Just a link to open it. The app doesn&apos;t read the conversation.</span>
          </label>
          <label className="block text-xs text-muted">
            Where it came from (optional)
            <input name="linkNote" maxLength={200} placeholder="e.g. Client asked by text on Nov 5" className={field} />
          </label>
          <label className="block text-xs text-muted">
            Notes (optional)
            <input name="notes" maxLength={500} defaultValue={defaults.notes} className={field} />
          </label>
        </div>
      </details>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : submitLabel}
      </button>
      {state?.ok && <p role="status" className="text-xs text-lime">Saved. Add another, or close this.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
