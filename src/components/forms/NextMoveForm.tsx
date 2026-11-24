"use client";

// The "next move" buttons: Copy message, Done (how it went) or Skip (why). Nothing is sent.

import { useActionState, useState } from "react";
import { logTouch } from "@/app/actions";
import { CopyButton } from "@/components/cards/CopyButton";
import type { TouchChannel } from "@/lib/journey";

const field = "min-h-10 rounded-xl border border-line bg-white/5 px-2 text-sm text-ink";
const CHANNELS: [TouchChannel, string][] = [
  ["call", "Call"],
  ["text", "Text"],
  ["email", "Email"],
  ["video", "Video"],
];

export function NextMoveForm({ clientId, slug, step, defaultChannel, draft }: { clientId: string; slug: string; step: number; defaultChannel: TouchChannel; draft: string }) {
  const [state, action, pending] = useActionState(logTouch, undefined);
  const [mode, setMode] = useState<"none" | "done" | "skip">("none");
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={draft} label="Copy the draft message" />
        <button type="button" onClick={() => setMode(mode === "done" ? "none" : "done")} aria-expanded={mode === "done"} className="pressable min-h-10 rounded-xl bg-violet-deep px-4 text-xs font-semibold">
          Done
        </button>
        <button type="button" onClick={() => setMode(mode === "skip" ? "none" : "skip")} aria-expanded={mode === "skip"} className="pressable min-h-10 rounded-xl border border-line px-3 text-xs">
          Skip
        </button>
      </div>
      {mode !== "none" && (
        <form action={action} className="space-y-2 rounded-2xl border border-line p-3">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="step" value={step} />
          <input type="hidden" name="op" value={mode} />
          {mode === "done" && (
            <div className="flex flex-wrap gap-2">
              <label className="block text-[11px] text-muted">
                How
                <select name="channel" defaultValue={defaultChannel} className={`${field} mt-0.5 block`}>
                  {CHANNELS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-muted">
                How are they doing? (optional)
                <select name="mood" defaultValue="" className={`${field} mt-0.5 block`}>
                  <option value="">Skip</option>
                  <option value="better">Better</option>
                  <option value="same">Same</option>
                  <option value="worse">Worse</option>
                </select>
              </label>
            </div>
          )}
          <label className="block text-[11px] text-muted">
            {mode === "skip" ? "Why skip it?" : "Note (optional)"}
            <input name="note" maxLength={300} required={mode === "skip"} placeholder={mode === "skip" ? "Asked for email only" : "Loved the new pages"} className={`${field} mt-0.5 block w-full`} />
          </label>
          <button type="submit" disabled={pending} className="pressable min-h-10 rounded-xl bg-violet-deep px-4 text-xs font-semibold disabled:opacity-60">
            {pending ? "Saving…" : mode === "skip" ? "Skip this touch" : "Mark done"}
          </button>
        </form>
      )}
      {state?.error && (
        <p role="alert" className="text-xs text-rose">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-xs text-lime">
          Saved. The next touch is up.
        </p>
      )}
    </div>
  );
}
