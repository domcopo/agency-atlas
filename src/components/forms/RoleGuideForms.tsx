"use client";

// Forms for role guides, personal goals and ideas (docs/ROLE_GUIDES_PLAN.md). Every rule is
// checked again on the server and by the database (0036); these only collect the text.

import { useActionState, useEffect, useRef } from "react";
import { addGoal, saveGuidePart, sendIdea } from "@/app/actions";
import { GUIDE_LIMITS } from "@/lib/role-guides";
import { IDEA_KINDS, IDEA_RULES } from "@/lib/ideas";
import type { MemberRole } from "@/lib/roles";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";
const submit = "pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60";
const MARKS = "Simple marks: # Heading, - bullet, 1. step, **bold**, [text](https://…). Never passwords or keys.";

function Result({ state, ok }: { state: { error?: string; ok?: boolean } | undefined; ok: string }) {
  if (state?.error) return <p role="alert" className="text-xs text-rose">{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-xs text-lime">{ok}</p>;
  return null;
}

/** Replace one starter part, or add / edit an added section. */
export function GuidePartForm({ role, part, id, title, body, isExtra }: { role: MemberRole; part: "duties" | "goals" | "how_to" | "extra"; id?: string | null; title?: string; body?: string; isExtra?: boolean }) {
  const [state, action, pending] = useActionState(saveGuidePart, undefined);
  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="part" value={part} />
      {id && <input type="hidden" name="id" value={id} />}
      {isExtra && (
        <label className="block text-xs text-muted">
          Section title
          <input name="title" required maxLength={GUIDE_LIMITS.title} defaultValue={title} placeholder="e.g. Friday checklist" className={field} />
        </label>
      )}
      <label className="block text-xs text-muted">
        Text
        <textarea name="body" required rows={8} maxLength={GUIDE_LIMITS.body} defaultValue={body} className={`${field} py-2 font-mono text-xs`} />
        <span className="mt-0.5 block text-[11px] text-faint">{MARKS}</span>
      </label>
      <button type="submit" disabled={pending} className={submit}>
        {pending ? "Saving…" : "Save"}
      </button>
      <Result state={state} ok="Saved. Earlier versions are kept." />
    </form>
  );
}

/** Owner/managers: give someone a goal. */
export function GoalForm({ people }: { people: { userId: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addGoal, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2.5">
      <label className="block text-xs text-muted">
        For
        <select name="userId" required defaultValue="" className={field}>
          <option value="" disabled>
            Pick a teammate
          </option>
          {people.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-muted">
        Goal
        <input name="goal" required maxLength={GUIDE_LIMITS.goal} placeholder="e.g. Finish the monthly SEO checks by the 5th" className={field} />
      </label>
      <label className="block text-xs text-muted">
        By (optional)
        <input name="dueOn" type="date" className={field} />
      </label>
      <button type="submit" disabled={pending} className={submit}>
        {pending ? "Saving…" : "Add goal"}
      </button>
      <Result state={state} ok="Goal added. Only that person (and the owner and managers) can see it." />
    </form>
  );
}

/** Anyone: send an idea or request. Saved in Atlas only. */
export function IdeaForm() {
  const [state, action, pending] = useActionState(sendIdea, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2.5">
      <fieldset className="text-xs text-muted">
        <legend>What kind?</legend>
        <div className="mt-1 flex flex-wrap gap-x-4">
          {IDEA_KINDS.map((k, i) => (
            <label key={k.kind} className="inline-flex min-h-10 items-center gap-2">
              <input type="radio" name="kind" value={k.kind} defaultChecked={i === 0} className="size-4 accent-violet" /> {k.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-xs text-muted">
        Title
        <input name="title" required maxLength={IDEA_RULES.title} placeholder="e.g. Show tomorrow's calls on Home" className={field} />
      </label>
      <label className="block text-xs text-muted">
        Details (optional)
        <textarea name="details" rows={4} maxLength={IDEA_RULES.details} placeholder="What would it help you do?" className={`${field} py-2`} />
      </label>
      <button type="submit" disabled={pending} className={submit}>
        {pending ? "Sending…" : "Save my idea"}
      </button>
      <Result state={state} ok="Saved for the owner to review. You'll see its status here." />
      <p className="text-[11px] text-faint">Saved inside Atlas with your name. Only the owner reads everyone&apos;s ideas. Nothing is emailed or sent anywhere.</p>
    </form>
  );
}
