"use client";

// Add or edit a tool in the tools list. Where the login is kept, never the password.

import { useActionState } from "react";
import { saveKitTool } from "@/app/actions";
import type { KitTool } from "@/lib/kit";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";

export function KitToolForm({ tool, staff }: { tool?: KitTool; staff: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveKitTool, undefined);
  return (
    <form action={action} className="space-y-2.5">
      {tool && <input type="hidden" name="id" value={tool.id} />}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-muted">
          Name
          <input name="name" required maxLength={80} defaultValue={tool?.name} placeholder="e.g. Rank tracker" className={field} />
        </label>
        <label className="block text-xs text-muted">
          Link (optional)
          <input name="url" type="url" maxLength={300} defaultValue={tool?.url ?? ""} placeholder="https://…" className={field} />
        </label>
      </div>
      <label className="block text-xs text-muted">
        What it&apos;s for
        <input name="purpose" maxLength={200} defaultValue={tool?.purpose ?? ""} placeholder="e.g. Weekly keyword rankings for SEO clients" className={field} />
      </label>
      <label className="block text-xs text-muted">
        Where the login is kept
        <input name="loginWhere" maxLength={120} defaultValue={tool?.loginWhere ?? ""} placeholder="e.g. Team password manager, &quot;SEO&quot; folder" className={field} />
        <span className="mt-0.5 block text-[11px] text-faint">Never the password itself (Atlas refuses it).</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-muted">
          Managed by
          <select name="managerId" defaultValue={tool?.managerId ?? ""} className={field}>
            <option value="">No one</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Who has access
          <input name="accessNote" maxLength={200} defaultValue={tool?.accessNote ?? ""} placeholder="e.g. Owner + SEO developers" className={field} />
        </label>
        <label className="block text-xs text-muted">
          Monthly cost ($)
          <input name="monthly" inputMode="decimal" maxLength={12} defaultValue={tool?.monthlyUsd ?? ""} placeholder="e.g. 49" className={field} />
        </label>
        <label className="block text-xs text-muted">
          Renews on
          <input name="renews" type="date" defaultValue={tool?.renewsOn ?? ""} className={field} />
        </label>
      </div>
      <label className="inline-flex min-h-10 items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="forDevelopers" defaultChecked={tool?.forDevelopers} className="size-4 accent-violet" /> Developers can see it (name, purpose, link, where the login is: no cost)
      </label>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : tool ? "Save tool" : "Add tool"}
      </button>
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
      {state?.ok && <p role="status" className="text-xs text-lime">Saved.</p>}
    </form>
  );
}
