"use client";

// Attach a run's results: paste the JSON or pick the file. The server checks every field,
// refuses contact details, scores each business and saves them.

import Link from "next/link";
import { useActionState } from "react";
import { attachScoutResults } from "@/app/actions";

export function AttachResultsForm({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState(attachScoutResults, undefined);
  if (state?.ok) {
    return (
      <div className="space-y-2">
        <p role="status" className="text-sm text-lime">{state.message}</p>
        {state.refused && state.refused.length > 0 && (
          <div className="rounded-2xl border border-amber/40 bg-amber/5 px-3 py-2 text-xs text-muted">
            <p className="font-semibold text-amber">Left out (had contact details):</p>
            <ul className="mt-1 list-disc pl-4">
              {state.refused.map((r, i) => (
                <li key={i}>
                  {r.name}: {r.why}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link href="/sales/scout" className="pressable inline-flex min-h-11 items-center rounded-xl bg-violet-deep px-4 text-sm font-semibold">See the prospects</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="runId" value={runId} />
      <label className="block text-xs text-muted">
        Results file
        <input type="file" name="file" accept="application/json,.json" className="mt-1 block w-full text-sm text-muted file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-line file:bg-white/5 file:px-3 file:text-sm file:font-semibold file:text-ink" />
      </label>
      <label className="block text-xs text-muted">
        …or paste the results
        <textarea name="results" rows={5} spellCheck={false} className="mt-1 w-full rounded-xl border border-line bg-white/5 px-3 py-2 font-mono text-xs text-ink" />
      </label>
      <button type="submit" disabled={pending} className="pressable min-h-12 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Checking…" : "Attach results"}
      </button>
      {state?.error && <p role="alert" className="text-sm text-rose">{state.error}</p>}
    </form>
  );
}
