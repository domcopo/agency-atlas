// Sales → Scout (docs/SCOUT_PLAN.md S1): local businesses worth a walk-in or a call.
// Read as the signed-in person: a salesperson gets their own prospects + the unclaimed
// shared pool; the owner and managers get everything. The database is the lock.

import { MapPinned, Plus, Route } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { assignProspects } from "@/app/actions";
import { GlassCard } from "@/components/cards/GlassCard";
import { ProspectRow } from "@/components/scout/ProspectRow";
import { ScoutSettingsForm } from "@/components/scout/ScoutSettingsForm";
import { Column, Columns } from "@/components/shell/Columns";
import { Fold } from "@/components/shell/Fold";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getMember, getScout, usesDatabase, type ScoutData } from "@/lib/data-source";
import { formatShortDate } from "@/lib/format";
import { isLead } from "@/lib/roles";
import { asScoutFilter, filterProspects, mapsRouteUrl, scoutFunnel, scoutLeft, walkInsToday, type Prospect, type ScoutFilter } from "@/lib/scout";

export const metadata: Metadata = { title: "Scout" };

const FILTER_LABEL: Record<ScoutFilter, string> = { all: "All", ads: "Run ads", seo: "Weak SEO", website: "No website", walk_in: "Storefront", pool: "Not given out" };

function List({ items, empty, names, claim, selectForm, limit = 30 }: { items: Prospect[]; empty: string; names?: Map<string, string>; claim?: boolean; selectForm?: string; limit?: number }) {
  if (!items.length) return <p className="glass rounded-3xl px-4 py-4 text-sm text-muted">{empty}</p>;
  const row = (p: Prospect) => (
    <li key={p.id}>
      <ProspectRow p={p} assignedName={p.assignedTo ? (names?.get(p.assignedTo) ?? null) : null} canClaim={claim} selectForm={selectForm} />
    </li>
  );
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <ol className="divide-y divide-line">{items.slice(0, limit).map(row)}</ol>
      {items.length > limit && (
        <details className="border-t border-line">
          <summary className="pressable flex min-h-11 cursor-pointer list-none items-center justify-center text-sm font-semibold text-violet">Show all {items.length}</summary>
          <ol className="divide-y divide-line border-t border-line">{items.slice(limit).map(row)}</ol>
        </details>
      )}
    </div>
  );
}

function Filters({ current, counts }: { current: ScoutFilter; counts: Record<ScoutFilter, number> }) {
  return (
    <nav aria-label="Filter prospects" className="mb-2.5 flex flex-wrap gap-1.5">
      {(Object.keys(FILTER_LABEL) as ScoutFilter[]).map((f) => (
        <Link key={f} href={f === "all" ? "/sales/scout" : `/sales/scout?f=${f}`} aria-current={f === current ? "page" : undefined} className={`pressable inline-flex min-h-10 items-center rounded-xl border px-3 text-xs font-semibold ${f === current ? "border-violet bg-violet-deep text-ink" : "border-line bg-white/5 text-muted"}`}>
          {FILTER_LABEL[f]} <span className="ml-1 text-faint">{counts[f]}</span>
        </Link>
      ))}
    </nav>
  );
}

function Spend({ scout }: { scout: ScoutData }) {
  const s = scoutLeft({ rows: scout.spend, me: scout.me, monthlyUsd: scout.settings.monthlyUsd, myCapUsd: scout.myCapUsd, now: new Date() });
  return (
    <p className="mt-1.5 px-1 text-[11px] text-faint">
      {scout.myCapUsd !== null ? `You: $${s.mine.toFixed(2)} of $${scout.myCapUsd.toFixed(2)} this month · ` : ""}
      {scout.role === "sales" ? `$${s.left.toFixed(2)} left for you` : `Everyone: $${s.total.toFixed(2)} of $${s.totalCap.toFixed(2)} this month`} · estimates set aside when a run starts
    </p>
  );
}

function Runs({ scout }: { scout: ScoutData }) {
  if (!scout.runs.length) return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No runs yet.</p>;
  return (
    <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
      {scout.runs.slice(0, 8).map((r) => (
        <li key={r.id}>
          <Link href={`/sales/scout/runs/${r.id}`} className="pressable flex min-h-12 items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{r.area}</span>
              <span className="block truncate text-[11px] text-faint">
                {r.kinds.slice(0, 3).join(", ")}{r.kinds.length > 3 ? ` +${r.kinds.length - 3}` : ""} · {formatShortDate(r.createdAt.slice(0, 10))}
                {r.byName ? ` · ${r.byName}` : ""}
              </span>
            </span>
            <span className={`shrink-0 text-xs font-semibold ${r.status === "attached" ? "text-lime" : "text-amber"}`}>{r.status === "attached" ? `${r.found ?? 0} found` : "Needs results"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Funnel({ scout }: { scout: ScoutData }) {
  const f = scoutFunnel(scout.prospects, scout.visits);
  const steps: [string, number][] = [
    ["Scouted", f.scouted],
    ["Given out", f.assigned],
    ["Visited / called", f.visited],
    ["Talked to the owner", f.talkedToOwner],
    ["Interested", f.interested],
    ["Wants an audit", f.audit],
    ["Won", f.won],
  ];
  return (
    <GlassCard>
      <ol className="space-y-1.5 text-sm">
        {steps.map(([label, n]) => (
          <li key={label} className="flex items-center justify-between gap-3">
            <span className="text-muted">{label}</span>
            <span className="font-display font-bold">{n}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 border-t border-line pt-2 text-[11px] text-faint">
        Counts prospects{scout.role === "sales" ? " you can see" : ""}. {f.doNotContact} marked do not contact. &quot;Won&quot; is filled in once leads are matched in GoHighLevel (next step).
      </p>
    </GlassCard>
  );
}

export default async function ScoutPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const me = usesDatabase() ? await getMember() : null;
  if (!usesDatabase()) {
    return (
      <>
        <PageHeader title="Scout" backHref="/sales" backLabel="Sales" />
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Scout needs the database. There is no sample data for it.</p>
      </>
    );
  }
  if (!isLead(me?.role) && me?.role !== "sales") return <RoleNotice title="Scout" />;
  const scout = await getScout();
  const filter = asScoutFilter((await searchParams).f);
  const lead = isLead(me?.role);
  const owner = me?.role === "owner";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const header = (
    <PageHeader
      title="Scout"
      subtitle={lead ? "Local businesses worth a walk-in or a call." : "Your walk-ins and calls, and the shared pool."}
      backHref="/sales"
      backLabel="Sales"
      action={
        <Link href="/sales/scout/new" className="pressable inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-violet-deep px-3.5 text-sm font-semibold">
          <Plus aria-hidden className="size-4" /> New run
        </Link>
      }
    />
  );
  if (!scout.ready) {
    return (
      <>
        {header}
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Scout needs one setup step first (0024 SQL).</p>
      </>
    );
  }
  const counts = Object.fromEntries((Object.keys(FILTER_LABEL) as ScoutFilter[]).map((f) => [f, filterProspects(scout.prospects, f, today).length])) as Record<ScoutFilter, number>;
  const shown = filterProspects(scout.prospects, filter, today);

  if (!lead) {
    const walkIns = walkInsToday(scout.prospects, scout.me);
    const route = mapsRouteUrl(walkIns);
    const mine = shown.filter((p) => p.assignedTo === scout.me);
    const pool = shown.filter((p) => p.assignedTo === null);
    return (
      <>
        {header}
        <Spend scout={scout} />
        <Columns>
          <Column>
            <SectionTitle aside={`${walkIns.length} stops`}>Walk-ins today</SectionTitle>
            {route ? (
              <a href={route} target="_blank" rel="noopener noreferrer" className="pressable glass flex min-h-14 items-center gap-3 rounded-3xl px-4 py-3">
                <Route aria-hidden className="size-5 shrink-0 text-teal" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Open the route in Google Maps</span>
                  <span className="block text-[11px] text-faint">From the office, nearest first. Opens Google Maps; nothing is sent from Atlas.</span>
                </span>
              </a>
            ) : (
              <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Nothing to walk in to yet. Claim some from the shared pool, or ask for some.</p>
            )}
            {walkIns.length > 0 && <List items={walkIns} empty="" />}
            <SectionTitle aside={`${mine.length}`}>My scout list</SectionTitle>
            <Filters current={filter} counts={counts} />
            <List items={mine} empty="Nothing here yet." />
          </Column>
          <Column>
            <SectionTitle aside={`${pool.length}`}>Shared pool</SectionTitle>
            <p className="mb-2 px-1 text-[11px] text-faint">Tap Claim to make one yours. Once claimed, nobody else sees it.</p>
            <List items={pool} empty="The pool is empty." claim />
            <SectionTitle>My runs</SectionTitle>
            <Runs scout={scout} />
            <SectionTitle>How it&apos;s going</SectionTitle>
            <Funnel scout={scout} />
          </Column>
        </Columns>
      </>
    );
  }

  return (
    <>
      {header}
      <Spend scout={scout} />
      <Columns layout="main">
        <Column>
          <SectionTitle aside={`${shown.length}`}>Prospects</SectionTitle>
          <Filters current={filter} counts={counts} />
          {owner && scout.people.length > 0 && (
            <form id="assign-form" action={assignProspects} className="glass mb-2.5 flex flex-wrap items-center gap-2 rounded-2xl p-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
                Give the ticked ones to
                <select name="to" defaultValue="" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white/5 px-3 text-sm text-ink">
                  <option value="">The shared pool</option>
                  {scout.people.map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="pressable min-h-11 rounded-xl bg-violet-deep px-4 text-sm font-semibold">Assign</button>
            </form>
          )}
          <List items={shown} empty="No prospects here yet. Start a run." names={scout.names} selectForm={owner && scout.people.length > 0 ? "assign-form" : undefined} limit={40} />
          {!owner && <p className="mt-1.5 px-1 text-[11px] text-faint">The owner gives prospects to salespeople. Salespeople can also claim from the pool.</p>}
        </Column>
        <Column>
          <SectionTitle>How it&apos;s going</SectionTitle>
          <Funnel scout={scout} />
          <SectionTitle aside={<Link href="/sales/scout/new" className="font-semibold text-violet">New run</Link>}>Runs</SectionTitle>
          <Runs scout={scout} />
          {owner && (
            <Fold title="Scout caps" summary={`$${scout.settings.monthlyUsd} a month in all · $${scout.settings.perRepMonthlyUsd} per salesperson`} label="Scout caps">
              <GlassCard>
                <ScoutSettingsForm {...scout.settings} />
              </GlassCard>
            </Fold>
          )}
          <p className="mt-4 flex items-start gap-2 px-1 text-[11px] text-faint">
            <MapPinned aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Public business facts only: no phone numbers, emails or people&apos;s names. Calls are dialed by hand from Google Maps. Existing clients, GoHighLevel leads and do-not-contact businesses are skipped automatically.
          </p>
        </Column>
      </Columns>
    </>
  );
}
