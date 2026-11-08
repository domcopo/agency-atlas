"use client";

// Buttons that ask the AI for something. The server checks the budget, logs the
// exact cost, and saves the answer; these only show progress and the result.

import { Sparkles } from "lucide-react";
import { useActionState } from "react";
import { generateBriefing, generateClientProfile, generateWorkOrderDrafts, setAiBudget } from "@/app/actions";

function Result({ state }: { state?: { error?: string; message?: string } }) {
  if (state?.message) return <p role="status" className="text-xs text-lime">{state.message}</p>;
  if (state?.error) return <p role="alert" className="text-xs text-rose">{state.error}</p>;
  return null;
}

export function BriefingButton({ label = "Get today's briefing", disabled = false }: { label?: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(generateBriefing, undefined);
  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={pending || disabled} className="pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        <Sparkles aria-hidden className="size-4" />
        {pending ? "Reading your clients… (up to a minute)" : label}
      </button>
      <Result state={state} />
    </form>
  );
}

export function WorkOrderDraftsButton({ label = "Draft work orders with AI", disabled = false }: { label?: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(generateWorkOrderDrafts, undefined);
  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={pending || disabled} className="pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet/40 bg-violet/10 text-sm font-semibold disabled:opacity-60">
        <Sparkles aria-hidden className="size-4" />
        {pending ? "Reading clients and workload… (up to a minute)" : label}
      </button>
      <Result state={state} />
    </form>
  );
}

export function ProfileButton({ slug, label, disabled = false }: { slug: string; label: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(generateClientProfile, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <button type="submit" disabled={pending || disabled} className="pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet/40 bg-violet/10 text-sm font-semibold disabled:opacity-60">
        <Sparkles aria-hidden className="size-4" />
        {pending ? "Drafting… (up to a minute)" : label}
      </button>
      <Result state={state} />
    </form>
  );
}

export function BudgetForm({ current }: { current: number }) {
  const [state, action, pending] = useActionState(setAiBudget, undefined);
  return (
    <form action={action} className="flex items-end gap-2">
      <label className="flex-1 text-xs text-muted">
        Monthly AI budget (US $)
        <input name="budget" type="number" min={0} max={100} step={1} defaultValue={current} required className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink" />
      </label>
      <button type="submit" disabled={pending} className="pressable min-h-11 rounded-xl bg-white/10 px-4 text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
      {state?.ok && <p role="status" className="text-xs text-lime">Saved.</p>}
    </form>
  );
}
