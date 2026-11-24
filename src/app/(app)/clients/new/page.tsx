// Add a client by hand (owner or manager), for clients GoHighLevel didn't bring in.

import type { Metadata } from "next";
import { AddClientForm } from "@/components/forms/AddClientForm";
import { GlassCard } from "@/components/cards/GlassCard";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { PageHeader } from "@/components/shell/PageHeader";
import { getCarePlans, getMember, getTeam, getToday, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "Add client" };

export default async function AddClientPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (!me || !isLead(me.role)) return <RoleNotice title="Add client" />;
  const [team, care] = await Promise.all([getTeam(), getCarePlans()]);
  return (
    <div className="lg:max-w-2xl">
      <PageHeader title="Add client" subtitle="For clients GoHighLevel didn't bring in" backHref="/clients" backLabel="Clients" />
      {!care.ready && (
        <p className="mb-3 rounded-2xl border border-amber/35 bg-amber/8 px-3.5 py-2.5 text-xs text-muted">
          {me.role === "owner" ? (
            <>
              Plan tiers, backups and VIP turn on after one setup step: run <span className="font-mono">0025_client_care.sql</span> in Supabase. You can still add a client now.
            </>
          ) : (
            "Adding clients needs one setup step first. Ask the owner."
          )}
        </p>
      )}
      <GlassCard>
        <AddClientForm staff={team.members.map((m) => ({ id: m.id, name: m.name }))} tiers={care.plans} isOwner={me.role === "owner"} today={getToday()} />
      </GlassCard>
    </div>
  );
}
