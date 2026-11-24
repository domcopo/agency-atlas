"use client";

// Owner only: a client's main person, backup, services, tier, VIP and monthly amount.
// Used on Set up clients (one row each) and on the client page. The server checks
// everything again; the database refuses anyone but the owner.

import { useActionState } from "react";
import { saveClientCare } from "@/app/actions";
import { cn } from "@/lib/format";
import type { CarePlan, ClientPlanRef, Service } from "@/lib/types";

const SERVICES: [Service, string][] = [
  ["SEO", "SEO"],
  ["Ads", "Google Ads"],
  ["Website", "Website build"],
];
const field = "min-h-10 rounded-xl border bg-white/5 px-2 text-sm text-ink";

export interface CareFormClient {
  dbId: string;
  slug: string;
  name: string;
  ownerId?: string;
  backupId?: string;
  vip?: boolean;
  services: Service[];
  plans?: ClientPlanRef[];
  monthlyUsd: number | null;
}

export function ClientCareForm({
  client,
  staff,
  tiers,
  careReady,
  layout = "stack",
}: {
  client: CareFormClient;
  staff: { id: string; name: string }[];
  /** Every tier (archived ones are offered only if the client is already on them). */
  tiers: CarePlan[];
  /** 0024 run: backup, tiers, VIP and amounts can be saved. */
  careReady: boolean;
  layout?: "stack" | "row";
}) {
  const [state, action, pending] = useActionState(saveClientCare, undefined);
  const tierOf = (s: Service) => client.plans?.find((p) => p.service === s)?.planId ?? "";
  const row = layout === "row";
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={client.dbId} />
      <input type="hidden" name="slug" value={client.slug} />
      <input type="hidden" name="servicesSent" value="1" />
      {careReady && <input type="hidden" name="vipSent" value="1" />}
      <div className={cn("grid gap-2", row ? "grid-cols-2 sm:flex sm:flex-wrap sm:items-center" : "grid-cols-2")}>
        <label className="block text-[11px] text-muted">
          Main person
          <select name="ownerId" defaultValue={client.ownerId ?? ""} aria-label={`Main person for ${client.name}`} className={cn(field, "mt-0.5 w-full", client.ownerId ? "border-line" : "border-amber/50 text-amber")}>
            <option value="">No one yet</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {careReady && (
          <label className="block text-[11px] text-muted">
            Backup
            <select name="backupId" defaultValue={client.backupId ?? ""} aria-label={`Backup for ${client.name}`} className={cn(field, "mt-0.5 w-full border-line")}>
              <option value="">No backup</option>
              {staff.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {SERVICES.map(([v, label]) => (
          <label key={v} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-white/5 px-2.5 text-xs">
            <input type="checkbox" name="services" value={v} defaultChecked={client.services.includes(v)} className="size-4 accent-violet-500" />
            {label}
          </label>
        ))}
      </div>
      {careReady && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {SERVICES.map(([v, label]) => {
            const options = tiers.filter((t) => t.service === v && (!t.archived || t.id === tierOf(v))).sort((a, b) => a.rank - b.rank);
            if (!options.length) return null;
            return (
              <label key={v} className="block text-[11px] text-muted">
                {label} tier
                <select name={`tier_${v}`} defaultValue={tierOf(v)} aria-label={`${label} tier for ${client.name}`} className={cn(field, "mt-0.5 w-full", client.services.includes(v) && !tierOf(v) ? "border-amber/50 text-amber" : "border-line")}>
                  <option value="">No tier</option>
                  {options.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.archived ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      )}
      {careReady && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-[11px] text-muted">
            Monthly ($, only you see it)
            <input name="monthly" inputMode="decimal" maxLength={12} defaultValue={client.monthlyUsd ?? ""} placeholder="e.g. 500" aria-label={`Monthly amount for ${client.name}`} className={cn(field, "mt-0.5 block w-28 border-line")} />
          </label>
          <label className="flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-white/5 px-2.5 text-xs">
            <input type="checkbox" name="vip" defaultChecked={client.vip} className="size-4 accent-violet-500" />
            VIP
          </label>
          <button type="submit" disabled={pending} className="pressable min-h-10 rounded-xl bg-violet-deep px-4 text-xs font-semibold disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {!careReady && (
        <button type="submit" disabled={pending} className="pressable min-h-10 rounded-xl bg-violet-deep px-4 text-xs font-semibold disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
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
    </form>
  );
}
