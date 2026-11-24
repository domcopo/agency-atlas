"use client";

// Add a client by hand (owner or manager), for clients GoHighLevel didn't bring in.
// Managers never see or set the amount or VIP; the server and database refuse them too.

import Link from "next/link";
import { useActionState } from "react";
import { addClient } from "@/app/actions";
import type { CarePlan, Service } from "@/lib/types";

const SERVICES: [Service, string][] = [
  ["SEO", "SEO"],
  ["Ads", "Google Ads"],
  ["Website", "Website build"],
];
const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";

export function AddClientForm({ staff, tiers, isOwner, today }: { staff: { id: string; name: string }[]; tiers: CarePlan[]; isOwner: boolean; today: string }) {
  const [state, action, pending] = useActionState(addClient, undefined);
  // After a problem the server sends back what was typed, so nothing has to be retyped.
  const v = state?.values;
  const val = (k: string, fallback = "") => (typeof v?.[k] === "string" ? (v[k] as string) : fallback);
  const ticked = (s: Service) => (v ? Array.isArray(v.services) && v.services.includes(s) : s === "SEO");
  return (
    <form action={action} className="space-y-3">
      <label className="block text-xs text-muted">
        Business name
        <input name="name" required maxLength={80} autoComplete="off" defaultValue={val("name")} placeholder="e.g. Sample Plumbing Co" className={field} />
      </label>
      <label className="block text-xs text-muted">
        Started on
        <input name="startDate" type="date" required defaultValue={val("startDate", today)} className={field} />
      </label>

      <fieldset>
        <legend className="text-xs text-muted">Services and tier</legend>
        <div className="mt-1 space-y-2">
          {SERVICES.map(([sv, label]) => {
            const options = tiers.filter((t) => t.service === sv && !t.archived).sort((a, b) => a.rank - b.rank);
            return (
              <div key={sv} className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-11 min-w-36 items-center gap-2 rounded-xl border border-line bg-white/5 px-3 text-sm">
                  <input type="checkbox" name="services" value={sv} defaultChecked={ticked(sv)} className="size-4 accent-violet-500" />
                  {label}
                </label>
                {options.length > 0 && (
                  <select name={`tier_${sv}`} defaultValue={val(`tier_${sv}`)} aria-label={`${label} tier`} className="min-h-11 flex-1 rounded-xl border border-line bg-white/5 px-2 text-sm text-ink">
                    <option value="">Pick a tier…</option>
                    {options.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.hoursPerMonth !== null ? ` · up to ${t.hoursPerMonth} h/month` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-faint">A tier is needed for each ticked service that has tiers.</p>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-muted">
          Main person (optional)
          <select name="ownerId" defaultValue={val("ownerId")} className={field}>
            <option value="">Decide later</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Backup (optional)
          <select name="backupId" defaultValue={val("backupId")} className={field}>
            <option value="">No backup</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isOwner && (
        <div className="grid grid-cols-2 items-end gap-2 rounded-2xl border border-violet/25 p-3">
          <label className="block text-xs text-muted">
            Monthly ($)
            <input name="monthly" inputMode="decimal" maxLength={12} defaultValue={val("monthly")} placeholder="e.g. 500" className={field} />
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white/5 px-3 text-sm">
            <input type="checkbox" name="vip" defaultChecked={val("vip") === "on"} className="size-4 accent-violet-500" /> VIP
          </label>
          <p className="col-span-2 text-[11px] text-faint">Only you see these. Managers adding a client never see this box.</p>
        </div>
      )}

      {state?.similar && state.similar.length > 0 && (
        <div role="alert" className="space-y-2 rounded-2xl border border-amber/40 bg-amber/8 p-3 text-sm">
          <p>{state.error}</p>
          <ul className="space-y-1">
            {state.similar.map((c) => (
              <li key={c.slug}>
                <Link href={`/clients/${c.slug}`} className="font-semibold text-violet hover:underline">
                  {c.name} →
                </Link>
              </li>
            ))}
          </ul>
          <label className="flex min-h-10 items-center gap-2 text-xs">
            <input type="checkbox" name="notDuplicate" className="size-4 accent-violet-500" /> It&apos;s a different client
          </label>
        </div>
      )}
      {state?.error && !state.similar?.length && (
        <p role="alert" className="text-xs text-rose">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="pressable min-h-12 w-full rounded-2xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Adding…" : "Add client"}
      </button>
      <p className="text-[11px] text-faint">Adds the client to Atlas only. Nothing is created or changed in GoHighLevel.</p>
    </form>
  );
}
