"use client";

// "Help me with this": the AI writes steps, checks and a ready-to-paste prompt for one
// work order. Shown here to copy by hand. Not saved, never sent anywhere. Cost is logged.

import { Sparkles } from "lucide-react";
import { useActionState } from "react";
import { generateWorkPrompt } from "@/app/actions";
import { CopyButton } from "@/components/cards/CopyButton";

export function WorkPromptButton({ actionId, disabled = false }: { actionId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(generateWorkPrompt, undefined);
  const r = state?.result;
  const all = r
    ? [r.summary, "", "Steps:", ...r.steps.map((s, i) => `${i + 1}. ${s}`), "", "Before marking done:", ...r.checks.map((c) => `[ ] ${c}`), "", "Prompt:", r.prompt].join("\n")
    : "";
  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="actionId" value={actionId} />
        <button
          type="submit"
          disabled={pending || disabled}
          className="pressable inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-violet/40 bg-violet/10 px-2.5 text-xs font-semibold disabled:opacity-60"
        >
          <Sparkles aria-hidden className="size-3.5" />
          {pending ? "Writing… (up to a minute)" : r ? "Write again" : "AI: steps + prompt"}
        </button>
      </form>
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
      {r && (
        <div className="space-y-2 rounded-xl border border-violet/30 bg-violet/5 p-2.5 text-xs">
          <p>{r.summary}</p>
          {r.steps.length > 0 && (
            <ol className="list-decimal space-y-0.5 pl-4 text-muted">
              {r.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          {r.checks.length > 0 && (
            <ul className="space-y-0.5 text-muted">
              {r.checks.map((c) => (
                <li key={c}>☐ {c}</li>
              ))}
            </ul>
          )}
          <div className="rounded-lg border border-line bg-black/20 p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-semibold">Prompt to paste into an AI assistant</span>
              <CopyButton text={r.prompt} label="Copy the prompt" />
            </div>
            <p className="whitespace-pre-wrap text-muted">{r.prompt}</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-faint">AI draft: check it before using. Cost ${r.costUsd.toFixed(3)}. Not saved.</span>
            <CopyButton text={all} label="Copy everything" />
          </div>
        </div>
      )}
    </div>
  );
}
