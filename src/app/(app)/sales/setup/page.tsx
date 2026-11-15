// Sales setup (owner only; the database refuses anyone else's changes too):
// 1. which pipelines count as Sales, and their hot stages;
// 2. which GoHighLevel user each login is (for "Mine" and lead owners);
// 3. each salesperson's daily reach-out target.

import type { Metadata } from "next";
import { linkGhlUser, saveSalesTarget } from "@/app/actions";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { SalesPipelineForm } from "@/components/sales/SalesPipelineForm";
import { getMember, getSales, getSalesSetup } from "@/lib/data-source";

export const metadata: Metadata = { title: "Sales setup" };

const field = "min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";
const btn = "pressable min-h-11 shrink-0 rounded-xl border border-line bg-white/5 px-3 text-sm font-semibold";

export default async function SalesSetupPage() {
  const me = await getMember();
  if (me?.role !== "owner") return <RoleNotice title="Sales setup" />;
  const [setup, sales] = await Promise.all([getSalesSetup(), getSales()]);
  if (!setup?.ready || !sales.ready) {
    return (
      <>
        <PageHeader title="Sales setup" backHref="/sales" backLabel="Sales" />
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Sales needs one setup step first (0020 SQL).</p>
      </>
    );
  }
  const current = new Map(sales.pipelines.map((p) => [p.id, p]));
  const salespeople = setup.logins.filter((l) => l.role === "sales");
  const targets = new Map(sales.people.map((p) => [p.userId, p.target]));

  return (
    <>
      <PageHeader title="Sales setup" subtitle="Only you can change this" backHref="/sales" backLabel="Sales" />

      <SectionTitle>1 · Sales pipelines</SectionTitle>
      {setup.available.length === 0 ? (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">
          No pipelines in the copy yet. Press Sync on Data Safety once: it now copies which pipeline each lead is in.
        </p>
      ) : (
        <div className="space-y-2.5">
          {setup.available.map((p) => (
            <SalesPipelineForm key={p.id} pipeline={p} current={current.get(p.id) ?? null} />
          ))}
        </div>
      )}
      <p className="mt-1.5 px-1 text-[11px] text-faint">
        Salespeople see only open leads in ticked pipelines. Stages are listed from the leads in the copy.
      </p>

      <SectionTitle>2 · Logins ↔ GoHighLevel users</SectionTitle>
      {setup.ghlUsers.length === 0 ? (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">
          No GoHighLevel users yet. Add the <span className="font-semibold text-ink">View Users</span> (users.readonly) permission to your
          GoHighLevel integration, then press Sync. Only ids and names are copied.
        </p>
      ) : (
        <div className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {setup.logins.map((l) => (
            <form key={`${l.userId}-${l.ghlUserId ?? ""}`} action={linkGhlUser} className="space-y-1.5 px-4 py-3">
              <input type="hidden" name="userId" value={l.userId} />
              <p className="text-sm font-semibold">
                {l.name} <span className="text-[11px] font-normal text-faint">({l.role})</span>
              </p>
              <div className="flex gap-2">
                <select name="ghlUserId" defaultValue={l.ghlUserId ?? ""} aria-label={`GoHighLevel user for ${l.name}`} className={field}>
                  <option value="">Not linked</option>
                  {setup.ghlUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className={btn}>
                  Save
                </button>
              </div>
            </form>
          ))}
        </div>
      )}

      <SectionTitle>3 · Daily targets</SectionTitle>
      {salespeople.length === 0 ? (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">
          No salespeople yet. Give a login the Sales role (docs/TEAM_ACCESS.md), then set their target here.
        </p>
      ) : (
        <div className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {salespeople.map((p) => (
            <form key={`${p.userId}-${targets.get(p.userId) ?? 15}`} action={saveSalesTarget} className="flex items-center gap-2 px-4 py-3">
              <input type="hidden" name="userId" value={p.userId} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
              <input
                name="target"
                type="number"
                min={0}
                max={200}
                defaultValue={targets.get(p.userId) ?? 15}
                aria-label={`Daily reach-outs for ${p.name}`}
                className="min-h-11 w-20 rounded-xl border border-line bg-white/5 px-3 text-sm text-ink"
              />
              <span className="text-xs text-muted">a day</span>
              <button type="submit" className={btn}>
                Save
              </button>
            </form>
          ))}
        </div>
      )}
      <p className="mt-1.5 px-1 text-[11px] text-faint">Weekdays only, New York time. Each salesperson sees only their own number.</p>
    </>
  );
}
