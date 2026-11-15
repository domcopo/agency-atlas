"use client";

// Owner: tick a pipeline as Sales and mark its hot stages. Stage names come from the
// synced copy; the server checks them against it again before saving.

import { useActionState } from "react";
import { saveSalesPipeline } from "@/app/actions";

export function SalesPipelineForm({
  pipeline,
  current,
}: {
  pipeline: { id: string; name: string; stages: string[]; leads: number };
  current: { active: boolean; hotStages: string[] } | null;
}) {
  const [state, action, pending] = useActionState(saveSalesPipeline, undefined);
  return (
    <form action={action} className="glass space-y-2 rounded-3xl p-4">
      <input type="hidden" name="pipelineId" value={pipeline.id} />
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="active" defaultChecked={current?.active ?? false} className="size-5 accent-violet" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{pipeline.name}</span>
          <span className="block text-[11px] text-faint">{pipeline.leads} leads in the copy · tick = a Sales pipeline</span>
        </span>
      </label>
      {pipeline.stages.length > 0 && (
        <fieldset className="text-xs text-muted">
          <legend>Hot stages (shown first in Today&apos;s plan)</legend>
          <div className="mt-1 flex flex-wrap gap-x-3">
            {pipeline.stages.map((st) => (
              <label key={st} className="inline-flex min-h-10 items-center gap-2">
                <input type="checkbox" name="hot" value={st} defaultChecked={current?.hotStages.includes(st) ?? false} className="size-4 accent-violet" /> {st}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.ok && <p role="status" className="text-xs text-lime">Saved.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
