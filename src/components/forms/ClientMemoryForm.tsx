"use client";

// Client memory: three short notes (goal, tone, next ask). Owner or manager.

import { useActionState } from "react";
import { saveClientMemory } from "@/app/actions";

const field = "mt-0.5 block min-h-10 w-full rounded-xl border border-line bg-white/5 px-2 text-sm text-ink";

export function ClientMemoryForm({ clientId, slug, memory }: { clientId: string; slug: string; memory: { goal: string | null; tone: string | null; nextAsk: string | null } }) {
  const [state, action, pending] = useActionState(saveClientMemory, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />
      <label className="block text-[11px] text-muted">
        Goal
        <input name="goal" maxLength={120} defaultValue={memory.goal ?? ""} placeholder="More calls from the north side" className={field} />
      </label>
      <label className="block text-[11px] text-muted">
        Tone
        <input name="tone" maxLength={120} defaultValue={memory.tone ?? ""} placeholder="Warm, short texts, no jargon" className={field} />
      </label>
      <label className="block text-[11px] text-muted">
        Next ask
        <input name="nextAsk" maxLength={120} defaultValue={memory.nextAsk ?? ""} placeholder="Photos of the new trucks" className={field} />
      </label>
      <button type="submit" disabled={pending} className="pressable min-h-10 rounded-xl bg-violet-deep px-4 text-xs font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Save memory"}
      </button>
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
