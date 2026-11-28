"use client";

// One suggestion's buttons in the Work hub's Suggestions panel (Phase 3):
// * Approve – adds it as suggested (createWorkOrder, the same checks as the form).
// * Edit    – opens the work order form filled in; nothing is saved until you add it.
// * Dismiss – hides it while its reason stays the same (dismissSuggestion, 0038).
// Nothing is ever created without a person pressing Approve or Add.

import { Check, Pencil, X } from "lucide-react";
import { useActionState, useState } from "react";
import { createWorkOrder, dismissSuggestion } from "@/app/actions";
import { nearestEst, WorkOrderForm } from "@/components/forms/WorkOrderForm";
import type { WorkOrderDraft } from "@/lib/types";
import type { SuggestionRule } from "@/lib/work-hub";

const btn = "pressable inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold disabled:opacity-50";

export function SuggestionActions({
  d,
  rule,
  clients,
  staff,
  today,
  canDismiss,
}: {
  d: WorkOrderDraft;
  rule: SuggestionRule;
  clients: { slug: string; name: string }[];
  staff: { id: string; name: string }[];
  today: string;
  /** 0038 has been run. */
  canDismiss: boolean;
}) {
  const [added, approve, adding] = useActionState(createWorkOrder, undefined);
  const [dismissed, dismiss, dismissing] = useActionState(dismissSuggestion, undefined);
  const [editing, setEditing] = useState(false);
  const defaults = { slug: d.clientSlug ?? undefined, title: d.title, steps: d.steps.join("\n"), priority: d.priority, ownerId: d.assigneeId ?? undefined, est: d.estMinutes, notes: d.why.slice(0, 500), due: d.dueOn ?? undefined };

  if (added?.ok) return <p role="status" className="mt-2 text-sm font-semibold text-lime">Added to work ✓</p>;
  if (dismissed?.ok) return <p role="status" className="mt-2 text-sm text-muted">Dismissed. It comes back only if the reason changes.</p>;
  if (!d.clientSlug) return <p className="mt-2 text-xs text-muted">Not tied to one client: add it by hand from + New if you want it.</p>;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <form action={approve}>
          <input type="hidden" name="fromDraft" value="1" />
          <input type="hidden" name="slug" value={d.clientSlug} />
          <input type="hidden" name="title" value={d.title} />
          <input type="hidden" name="steps" value={d.steps.join("\n")} />
          <input type="hidden" name="notes" value={d.why.slice(0, 500)} />
          <input type="hidden" name="priority" value={d.priority} />
          {d.assigneeId && <input type="hidden" name="ownerId" value={d.assigneeId} />}
          {d.estMinutes ? <input type="hidden" name="est" value={nearestEst(d.estMinutes)} /> : null}
          {d.dueOn && <input type="hidden" name="due" value={d.dueOn} />}
          <button type="submit" disabled={adding || d.contactWarning} className={`${btn} border border-violet/50 bg-violet/20 text-ink hover:bg-violet/30`}>
            <Check aria-hidden className="size-4" /> {adding ? "Adding…" : "Approve"}
          </button>
        </form>
        <button type="button" onClick={() => setEditing((e) => !e)} aria-expanded={editing} className={`${btn} border border-line bg-white/5`}>
          <Pencil aria-hidden className="size-4" /> Edit
        </button>
        {canDismiss && (
          <form action={dismiss}>
            <input type="hidden" name="slug" value={d.clientSlug} />
            <input type="hidden" name="rule" value={rule} />
            <input type="hidden" name="reason" value={d.why.slice(0, 300)} />
            <button type="submit" disabled={dismissing} className={`${btn} text-muted hover:bg-white/[0.06] hover:text-ink`}>
              <X aria-hidden className="size-4" /> {dismissing ? "Dismissing…" : "Dismiss"}
            </button>
          </form>
        )}
      </div>
      {d.contactWarning && <p className="mt-2 text-xs text-amber">This looks like it holds an email or phone number. Use Edit to take it out first.</p>}
      {added?.error && <p role="alert" className="mt-2 text-xs text-rose">{added.error}</p>}
      {dismissed?.error && <p role="alert" className="mt-2 text-xs text-rose">{dismissed.error}</p>}
      {editing && (
        <div className="mt-3 rounded-2xl border border-line p-3">
          <WorkOrderForm clients={clients} staff={staff} today={today} fromDraft submitLabel="Add this work order" defaults={defaults} />
        </div>
      )}
    </div>
  );
}
