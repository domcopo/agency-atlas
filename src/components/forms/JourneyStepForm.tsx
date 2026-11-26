"use client";

// Edit one journey step (owner/managers, 0038): words, day, channel, deliverable and the
// copy-only draft. The step number and stage stay fixed. Saving changes it for everyone.

import { useActionState } from "react";
import { saveJourneyStep } from "@/app/actions";
import { JOURNEY_DELIVERABLES, type JourneyTouch } from "@/lib/journey";

const field = "mt-0.5 block w-full rounded-xl border border-line bg-white/5 px-2.5 py-2 text-sm text-ink";
const label = "block text-[11px] font-semibold text-muted";

export function JourneyStepForm({ t, minDay, maxDay, canSave }: { t: JourneyTouch; minDay: number; maxDay: number; canSave: boolean }) {
  const [state, action, pending] = useActionState(saveJourneyStep, undefined);
  const grow = t.step > 100;
  const id = (k: string) => `step-${t.step}-${k}`;
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="step" value={t.step} />
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <label className={label} htmlFor={id("title")}>
          Name
          <input id={id("title")} name="title" defaultValue={t.title} maxLength={60} required className={field} />
        </label>
        {!grow ? (
          <label className={label} htmlFor={id("day")}>
            Day ({minDay}–{maxDay})
            <input id={id("day")} name="day" type="number" min={minDay} max={maxDay} defaultValue={t.day} required className={field} />
          </label>
        ) : (
          <input type="hidden" name="day" value="0" />
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label} htmlFor={id("how")}>
          How (shown on the card)
          <input id={id("how")} name="how" defaultValue={t.how} maxLength={60} required className={field} />
        </label>
        <label className={label} htmlFor={id("channel")}>
          Channel
          <select id={id("channel")} name="channel" defaultValue={t.channel} className={field}>
            <option value="call">Call</option>
            <option value="text">Text</option>
            <option value="email">Email</option>
            <option value="video">Video call</option>
          </select>
        </label>
        <label className={label} htmlFor={id("deliverable")}>
          Deliverable
          <select id={id("deliverable")} name="deliverable" defaultValue={t.deliverable} className={field}>
            {JOURNEY_DELIVERABLES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" name="withSeo" defaultChecked={t.withSeo} className="size-4 accent-violet" />
        Done with the SEO team&apos;s work in hand
      </label>
      <label className={label} htmlFor={id("say")}>
        What to say
        <textarea id={id("say")} name="say" defaultValue={t.say} maxLength={400} required rows={3} className={field} />
      </label>
      <label className={label} htmlFor={id("ask")}>
        What to ask for (optional)
        <textarea id={id("ask")} name="ask" defaultValue={t.ask ?? ""} maxLength={300} rows={2} className={field} />
      </label>
      <label className={label} htmlFor={id("template")}>
        Copy-only draft (optional). Use [First name], [Your name] and [Business]; no emails or phone numbers.
        <textarea id={id("template")} name="template" defaultValue={t.template ?? ""} maxLength={1000} rows={4} className={field} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !canSave} className="pressable min-h-11 rounded-xl bg-violet-deep px-4 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save step"}
        </button>
        <p role="status" className={state?.error ? "text-xs text-rose" : "text-xs text-lime"}>
          {state?.error ?? (state?.ok ? "Saved. Everyone's journey uses it now." : "")}
        </p>
      </div>
    </form>
  );
}
