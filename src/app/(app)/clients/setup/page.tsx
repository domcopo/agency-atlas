// Owner only: set every current client's main person, backup, services, tier, VIP and
// monthly amount from one screen. One Save per row; each change goes in that client's history
// (never the amount: managers can read the history).

import { Check, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClientCareForm } from "@/components/forms/ClientCareForm";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { PageHeader } from "@/components/shell/PageHeader";
import { getCarePlans, getMember, getRoster, getTeam, usesDatabase } from "@/lib/data-source";
import { byImportance } from "@/lib/ops";
import type { RosterClient } from "@/lib/types";

export const metadata: Metadata = { title: "Set up clients" };

export default async function SetupPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (me?.role !== "owner") return <RoleNotice title="Set up clients" />;
  const [clients, team, care] = await Promise.all([getRoster(), getTeam(), getCarePlans()]);
  /** Set up = has a main person, a service, and (after 0025) a tier for each service that has tiers. */
  const complete = (c: RosterClient) =>
    Boolean(c.ownerId && c.services.length) &&
    (!care.ready || c.services.every((s) => !care.plans.some((p) => p.service === s && !p.archived) || c.plans?.some((p) => p.service === s)));
  const rows = clients
    .filter((c) => (c.status === "active" || c.status === "paused") && c.dbId)
    // Unfinished first, then VIP / top tier / biggest.
    .sort((a, b) => Number(complete(a)) - Number(complete(b)) || byImportance(a, b));
  const done = rows.filter(complete).length;
  const staff = team.members.map((m) => ({ id: m.id, name: m.name }));
  // Wide screens: kept to a comfortable reading width.
  return (
    <div className="lg:max-w-4xl">
      <PageHeader title="Set up clients" subtitle={`${done} of ${rows.length} fully set up`} backHref="/clients" backLabel="Clients" />
      <p className="mb-3 px-1 text-xs text-muted">
        Pick a main person{care.ready ? ", a backup and a tier" : ""}, tick the services, then Save on that row. Unfinished clients are at the top.
        {care.ready && (
          <>
            {" "}
            Tiers live on{" "}
            <Link href="/clients/plans" className="text-violet underline-offset-2 hover:underline">
              Plan tiers
            </Link>
            . Amounts and VIP are only ever shown to you.
          </>
        )}
      </p>
      {!care.ready && (
        <p className="mb-3 rounded-2xl border border-amber/35 bg-amber/8 px-3.5 py-2.5 text-xs text-muted">
          Backups, tiers, VIP and owner-only amounts turn on after one setup step: run <span className="font-mono">0025_client_care.sql</span> in Supabase.
        </p>
      )}
      <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
        {rows.map((c) => (
          <li key={c.id} className="px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Link href={`/clients/${c.id}`} className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold hover:underline">
                <span className="truncate">{c.name}</span>
                {c.vip && <Star aria-label="VIP" className="size-3.5 shrink-0 fill-amber text-amber" />}
              </Link>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                {c.monthlyUsd !== null && `$${c.monthlyUsd.toLocaleString("en-US")}/mo`}
                {c.status === "paused" ? " · paused" : ""}
                {complete(c) && <Check aria-label="Set up" className="size-3.5 text-lime" />}
              </span>
            </div>
            <ClientCareForm
              layout="row"
              client={{ dbId: c.dbId!, slug: c.id, name: c.name, ownerId: c.ownerId, backupId: c.backupId, vip: c.vip, services: c.services, plans: c.plans, monthlyUsd: c.monthlyUsd }}
              staff={staff}
              tiers={care.plans}
              careReady={care.ready}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
