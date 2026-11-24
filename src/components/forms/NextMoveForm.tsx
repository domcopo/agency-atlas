"use client";

// The "next move" buttons: Copy message, Draft with AI, Done (how it went) or Skip (why).
// Calls first: "No answer" keeps the touch open for the next working day. Nothing is sent.

import { useActionState, useState } from "react";
import { draftTouchMessage, logTouch } from "@/app/actions";
import { CopyButton } from "@/components/cards/CopyButton";
import { CALL_TRIES, type TouchChannel } from "@/lib/journey";

const field = "min-h-10 rounded-xl border border-line bg-white/5 px-2 text-sm text-ink";

export function NextMoveForm({
  clientId,
  slug,
  step,
  defaultChannel,
  draft,
  attempts,
  canUseAi,
}: {
  clientId: string;
  slug: string;
  step: number;
  defaultChannel: TouchChannel;
  draft: string;
  attempts: number;
  canUseAi: boolean;
}) {
  const [state, action, pending] = useActionState(logTouch, undefined);
  const [ai, askAi, drafting] = useActionState(draftTouchMessage, undefined);
  const [mode, setMode] = useState<"none" | "done" | "skip">("none");
  const isCall = defaultChannel === "call" || defaultChannel === "video";
  // After a couple of unanswered calls, suggest finishing it by text instead.
  const suggestText = isCall && attempts >= CALL_TRIES;
  const defaultHow = suggestText ? "text" : defaultChannel === "call" ? "call_talked" : defaultChannel;
  const message = ai?.draft ?? draft;
  return (
    <div className="mt-3 space-y-2">
      {attempts > 0 && (
        <p className="text-xs text-amber">
          {attempts} unanswered call{attempts === 1 ? "" : "s"} so far.{" "}
          {suggestText ? "Finish it by text or email: send the report or pictures and a short note." : "Call again, and leave a voicemail and a text if they don't pick up."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={message} label={ai?.draft ? "Copy the AI draft" : "Copy the draft message"} />
        {canUseAi && (
          <form action={askAi}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="step" value={step} />
            <button type="submit" disabled={drafting} className="pressable min-h-10 rounded-xl border border-violet/40 px-3 text-xs font-semibold text-violet disabled:opacity-60">
              {drafting ? "Drafting…" : ai?.draft ? "Draft again" : "Draft with AI"}
            </button>
          </form>
        )}
        <button type="button" onClick={() => setMode(mode === "done" ? "none" : "done")} aria-expanded={mode === "done"} className="pressable min-h-10 rounded-xl bg-violet-deep px-4 text-xs font-semibold">
          Done
        </button>
        <button type="button" onClick={() => setMode(mode === "skip" ? "none" : "skip")} aria-expanded={mode === "skip"} className="pressable min-h-10 rounded-xl border border-line px-3 text-xs">
          Skip
        </button>
      </div>
      {ai?.draft && (
        <div className="rounded-2xl border border-line bg-white/[0.03] p-3">
          <p className="whitespace-pre-wrap text-sm">{ai.draft}</p>
          <p className="mt-1 text-[11px] text-faint">AI draft{ai.cost ? ` · ${ai.cost}` : ""}. Check it, fill in [First name] and [Your name], then copy. Nothing is sent from Atlas.</p>
        </div>
      )}
      {ai?.error && (
        <p role="alert" className="text-xs text-rose">
          {ai.error}
        </p>
      )}
      {mode !== "none" && (
        <form action={action} className="space-y-2 rounded-2xl border border-line p-3">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="step" value={step} />
          <input type="hidden" name="op" value={mode} />
          {mode === "done" && (
            <div className="flex flex-wrap gap-2">
              <label className="block text-[11px] text-muted">
                How did it go?
                <select name="how" defaultValue={defaultHow} className={`${field} mt-0.5 block`}>
                  <option value="call_talked">Call: we talked</option>
                  <option value="call_noanswer">Call: no answer (left voicemail + text)</option>
                  <option value="video">Video call</option>
                  <option value="text">Text</option>
                  <option value="email">Email</option>
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
            {pending ? "Saving…" : mode === "skip" ? "Skip this touch" : "Save"}
          </button>
          {mode === "done" && <p className="text-[11px] text-faint">A real conversation counts 3 toward today&apos;s goal; a voicemail + text, a text or an email counts 1.</p>}
        </form>
      )}
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
    </div>
  );
}
