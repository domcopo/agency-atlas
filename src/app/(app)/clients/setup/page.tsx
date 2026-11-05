// Owner only: set every current client's owner and plan from one screen.
// One Save per row; each change is written to that client's history.

import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { saveClientSetup } from "@/app/actions";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { PageHeader } from "@/components/shell/PageHeader";
import { getMember, getRoster, getTeam, usesDatabase } from "@/lib/data-source";
import { cn } from "@/lib/format";

export const metadata: Metadata = { title: "Set up clients" };

const SERVICES = [
  ["Website", "Website build"],
  ["SEO", "SEO"],
  ["Ads", "Google Ads"],
] as const;

export default async function SetupPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (me?.role !== "owner") return <RoleNotice title="Set up clients" />;
  const [clients, team] = await Promise.all([getRoster(), getTeam()]);
  const rows = clients
    .filter((c) => (c.status === "active" || c.status === "paused") && c.dbId)
    // Unfinished first (no owner or no services), then biggest first.
    .sort((a, b) => Number(Boolean(a.ownerId && a.services.length)) - Number(Boolean(b.ownerId && b.services.length)) || b.monthlyUsd - a.monthlyUsd);
  const done = rows.filter((c) => c.ownerId && c.services.length).length;
  return (
    <>
      <PageHeader title="Set up clients" subtitle={`${done} of ${rows.length} have an owner and a plan`} backHref="/clients" backLabel="Clients" />
      <p className="mb-3 px-1 text-xs text-muted">Pick an owner and tick the services, then Save on that row. Unfinished clients are at the top.</p>
      <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
        {rows.map((c) => {
          const complete = Boolean(c.ownerId && c.services.length);
          return (
            <li key={c.id} className="px-4 py-3">
              <form action={saveClientSetup} className="space-y-2">
                <input type="hidden" name="clientId" value={c.dbId} />
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/clients/${c.id}`} className="min-w-0 truncate text-sm font-semibold hover:underline">
                    {c.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                    ${c.monthlyUsd.toLocaleString("en-US")}/mo{c.status === "paused" ? " · paused" : ""}
                    {complete && <Check aria-label="Set up" className="size-3.5 text-lime" />}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    name="ownerId"
                    defaultValue={c.ownerId ?? ""}
                    aria-label={`Owner for ${c.name}`}
                    className={cn("min-h-10 rounded-xl border bg-white/5 px-2 text-sm", c.ownerId ? "border-line" : "border-amber/50 text-amber")}
                  >
                    <option value="">No owner</option>
                    {team.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  {SERVICES.map(([v, label]) => (
                    <label key={v} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-white/5 px-2.5 text-xs">
                      <input type="checkbox" name="services" value={v} defaultChecked={c.services.includes(v)} className="size-4 accent-violet-500" />
                      {label}
                    </label>
                  ))}
                  <button type="submit" className="pressable min-h-10 rounded-xl bg-violet-deep px-3 text-xs font-semibold">
                    Save
                  </button>
                </div>
              </form>
            </li>
          );
        })}
      </ul>
    </>
  );
}
