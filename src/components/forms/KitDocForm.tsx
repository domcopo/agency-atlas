"use client";

// Add or edit a Kit page (owner and managers; the database enforces it and keeps every
// version). Plain text with a few simple marks, shown below the box.

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { saveKitDoc } from "@/app/actions";
import { KIT_KINDS, type KitDoc } from "@/lib/kit";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";

export function KitDocForm({ doc, defaultKind = "sop" }: { doc?: KitDoc; defaultKind?: KitDoc["kind"] }) {
  const [state, action, pending] = useActionState(saveKitDoc, undefined);
  const router = useRouter();
  // A new page opens once it's saved.
  useEffect(() => {
    if (state?.ok && state.id && !doc) router.push(`/kit/${state.id}`);
  }, [state, doc, router]);
  const aud = doc?.audience ?? ["manager", "developer"];
  return (
    <form action={action} className="space-y-2.5">
      {doc && <input type="hidden" name="id" value={doc.id} />}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-muted">
          Kind
          <select name="kind" defaultValue={doc?.kind ?? defaultKind} className={field}>
            {KIT_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Group (optional)
          <input name="category" maxLength={40} defaultValue={doc?.category ?? ""} placeholder="e.g. SEO, Ads, Websites" className={field} />
        </label>
      </div>
      <label className="block text-xs text-muted">
        Title
        <input name="title" required maxLength={120} defaultValue={doc?.title} placeholder="e.g. Monthly SEO check" className={field} />
      </label>
      <label className="block text-xs text-muted">
        Text
        <textarea name="body" rows={14} maxLength={20000} defaultValue={doc?.body} placeholder={"# Goal\nWhat this is for.\n\n## Steps\n1. First step\n2. Second step\n\n- Tip: use **bold** and [links](https://example.com)"} className={`${field} py-2 font-mono text-xs`} />
        <span className="mt-0.5 block text-[11px] text-faint">
          Simple marks: <code># Heading</code>, <code>## Smaller</code>, <code>- bullet</code>, <code>1. step</code>, <code>**bold**</code>, <code>[text](https://…)</code>. Never put passwords or keys here.
        </span>
      </label>
      <fieldset className="text-xs text-muted">
        <legend>Who can read it (you always can)</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          <label className="inline-flex min-h-10 items-center gap-2">
            <input type="checkbox" name="aud_manager" defaultChecked={aud.includes("manager")} className="size-4 accent-violet" /> Managers
          </label>
          <label className="inline-flex min-h-10 items-center gap-2">
            <input type="checkbox" name="aud_developer" defaultChecked={aud.includes("developer")} className="size-4 accent-violet" /> Developers
          </label>
        </div>
      </fieldset>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : doc ? "Save changes" : "Add page"}
      </button>
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
      {state?.ok && doc && <p role="status" className="text-xs text-lime">Saved. The old version is kept in the history below.</p>}
    </form>
  );
}
