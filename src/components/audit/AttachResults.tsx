"use client";

// Attach results (docs/AUDIT_RESULTS_PLAN.md B1): the rep pastes Claude's whole reply (or picks
// the .md / .json file it made). "Check" shows what was found and any problems; "Save" checks
// again on the server and stores it. A picked file is only read here as text: never uploaded
// or kept as a file. Everything shown back is plain text.

import { ClipboardPaste, FileUp } from "lucide-react";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { attachAuditResults } from "@/app/actions";
import { SOURCE_LABELS } from "@/lib/audit/data";
import { fmtDate } from "@/lib/audit/format";
import { RESULTS_LIMITS, RESULTS_MARKER } from "@/lib/audit/results";

export function AttachResults({ id, attachedOn }: { id: string; attachedOn: string | null }) {
  const [state, action, pending] = useActionState(attachAuditResults, undefined);
  const [results, setResults] = useState("");
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [checkedText, setCheckedText] = useState<string | null>(null);

  // Submit by hand so React doesn't clear the box after a refused check (see AuditBuilder).
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(e.currentTarget, submitter);
    if (data.get("mode") === "check") setCheckedText(results);
    startTransition(() => action(data));
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > RESULTS_LIMITS.bytes) {
      setFileNote("That file is too big to be one audit's results (max 400 KB).");
      return;
    }
    setResults(await file.text());
    setFileNote(`Read ${file.name}. Press Check.`);
  };

  const errors = state?.errors ?? (state?.error ? [state.error] : []);
  const checkedOk = !!state?.summary && !state.saved && checkedText === results;

  return (
    <form onSubmit={submit} className="glass space-y-3 rounded-3xl p-4">
      <input type="hidden" name="id" value={id} />
      <div>
        <p className="text-sm font-semibold">Attach results</p>
        <p className="text-xs text-muted">
          After running the custom prompt, paste Claude&apos;s whole reply here (it ends with <span className="font-mono text-[11px]">{RESULTS_MARKER}</span> and a block of data), or pick the file it made. Atlas checks every number before using it.
          {attachedOn ? ` Results from ${fmtDate(attachedOn)} are attached; saving new ones replaces them.` : ""}
        </p>
      </div>
      <label className="block">
        <span className="sr-only">Claude&apos;s reply</span>
        <textarea
          name="results"
          value={results}
          onChange={(e) => setResults(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={`Paste Claude's reply here…\n\n${RESULTS_MARKER}\n{ "atlas": "results-v1", … }`}
          className="w-full rounded-xl border border-line bg-white/5 px-3 py-2 font-mono text-[11.5px] text-ink placeholder:text-faint"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="pressable inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-violet">
          <FileUp aria-hidden className="size-4" /> Pick a file
          <input type="file" accept=".md,.json,.txt,text/plain,text/markdown,application/json" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0])} />
        </label>
        <button type="submit" name="mode" value="check" disabled={pending || !results.trim()} className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-violet-deep px-4 text-sm font-semibold disabled:opacity-60">
          <ClipboardPaste aria-hidden className="size-4" /> {pending ? "Checking…" : "Check"}
        </button>
        {fileNote && <span className="text-xs text-faint">{fileNote}</span>}
      </div>

      {errors.length > 0 && (
        <div role="alert" className="rounded-2xl border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
          <p className="font-semibold">{state?.errors ? "Not attached. Ask Claude to correct these in the block, then paste it again:" : "Not attached."}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {state?.summary && (
        <div className={`rounded-2xl border px-3 py-2 text-xs ${state.saved ? "border-lime/40 bg-lime/10 text-lime" : "border-line bg-white/5 text-ink"}`}>
          <p className="font-semibold">
            {state.saved ? "Saved. The pages now show these results." : "Looks good:"} Data from {fmtDate(state.summary.retrieved)} ({state.summary.sources.map((s) => SOURCE_LABELS[s]).join(", ")}).
          </p>
          <p className="mt-0.5">{state.summary.counts.map((c) => `${c.n} ${c.label}`).join(" · ")}</p>
          {state.warnings && state.warnings.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber">
              {state.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {!state.saved && <p className="mt-1 text-faint">Spot-check a couple of figures against Claude&apos;s reply before sending the audit to anyone.</p>}
        </div>
      )}

      {checkedOk && (
        <button type="submit" name="mode" value="save" disabled={pending} className="pressable min-h-12 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
          {pending ? "Saving…" : "Save results"}
        </button>
      )}
    </form>
  );
}
