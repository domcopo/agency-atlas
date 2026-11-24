// Owner only: restart every active client's journey (a few kickoffs per working day, most
// important first) and set each person's daily goal. The schedule below is a preview:
// nothing changes until "Restart all journeys" is pressed. Old touches stay in history.

import type { Metadata } from "next";
import Link from "next/link";
import { restartAllJourneys, saveCareTarget } from "@/app/actions";
import { GlassCard } from "@/components/cards/GlassCard";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getCareGoals, getJourneys, getMember, getRoster, getToday, usesDatabase } from "@/lib/data-source";
import { formatDate } from "@/lib/format";
import { CARE_POINTS, RESTART_PER_DAY, restartSchedule } from "@/lib/journey";
import { byImportance } from "@/lib/ops";

export const metadata: Metadata = { title: "Restart journeys" };

const field = "mt-0.5 block min-h-10 rounded-xl border border-line bg-white/5 px-2 text-sm text-ink";

export default async function RestartPage({ searchParams }: { searchParams: Promise<{ from?: string; perDay?: string }> }) {
  const me = usesDatabase() ? await getMember() : null;
  if (me?.role !== "owner") return <RoleNotice title="Restart journeys" />;
  const params = await searchParams;
  const today = getToday();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") && params.from! >= today ? params.from! : today;
  const perDay = Math.min(10, Math.max(1, Number(params.perDay) || RESTART_PER_DAY));
  const [clients, journeys, goals] = await Promise.all([getRoster(), getJourneys(), getCareGoals()]);
  const active = clients.filter((c) => c.status === "active" && c.dbId).sort(byImportance);
  const plan = restartSchedule(active, from, perDay);
  const days = [...new Set(plan.map((p) => p.start))];

  return (
    <div className="lg:max-w-4xl">
      <PageHeader title="Restart journeys" subtitle="Everyone back through month 1, a few a day" backHref="/clients" backLabel="Clients" />
      {!journeys.ready ? (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">
          The journey needs one setup step first: run <span className="font-mono text-xs">0028_client_journey.sql</span> in Supabase.
        </p>
      ) : (
        <>
          <GlassCard className="space-y-3">
            <p className="text-sm">
              <span className="font-semibold">{plan.length} active clients</span> restart at touch 1 (the kickoff call), {perDay} a working day, VIP and top tier first. That&apos;s {days.length} working day
              {days.length === 1 ? "" : "s"}: {plan.length ? `${formatDate(days[0]!)} to ${formatDate(days[days.length - 1]!)}` : "nothing to do"}.
            </p>
            <form method="get" className="flex flex-wrap items-end gap-2">
              <label className="block text-[11px] text-muted">
                Start on
                <input type="date" name="from" defaultValue={from} min={today} className={field} />
              </label>
              <label className="block text-[11px] text-muted">
                Kickoffs a day
                <input type="number" name="perDay" defaultValue={perDay} min={1} max={10} className={`${field} w-20`} />
              </label>
              <button type="submit" className="pressable min-h-10 rounded-xl border border-line px-3 text-xs font-semibold">
                Update preview
              </button>
            </form>
            <p className="text-[11px] text-faint">Nothing is deleted: old touches stay in each client&apos;s history but stop counting. You can restart again any time.</p>
          </GlassCard>

          <SectionTitle aside={`${plan.length} clients`}>Preview</SectionTitle>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl lg:columns-2 lg:gap-0 lg:[&>li]:break-inside-avoid">
            {plan.map(({ client, start }) => (
              <li key={client.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link href={`/clients/${client.id}`} className="min-w-0 truncate text-sm font-semibold hover:underline">
                  {client.name}
                  {client.vip ? " ★" : ""}
                </Link>
                <span className="shrink-0 text-xs text-muted">Kickoff {formatDate(start)}</span>
              </li>
            ))}
          </ul>

          {plan.length > 0 && (
            <form action={restartAllJourneys} className="mt-3">
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="perDay" value={perDay} />
              <button type="submit" className="pressable min-h-12 w-full rounded-2xl bg-violet-deep text-sm font-semibold">
                Restart all {plan.length} journeys
              </button>
            </form>
          )}
        </>
      )}

      <SectionTitle aside={`talked ${CARE_POINTS.talked} · text, email or voicemail ${CARE_POINTS.message}`}>Daily goals</SectionTitle>
      {!goals.ready ? (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">
          Daily goals turn on after one setup step: run <span className="font-mono text-xs">0030_care_goals.sql</span> in Supabase.
        </p>
      ) : (
        <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {goals.people.map((p) => (
            <li key={p.userId} className="px-4 py-2.5">
              <form action={saveCareTarget} className="flex flex-wrap items-center justify-between gap-2">
                <input type="hidden" name="userId" value={p.userId} />
                <span className="text-sm">
                  <span className="font-semibold">{p.name}</span> <span className="text-xs text-muted">({p.role})</span>
                </span>
                <span className="flex items-center gap-2">
                  <input type="number" name="points" defaultValue={p.points} min={1} max={200} aria-label={`Daily goal for ${p.name}`} className={`${field} mt-0 w-20`} />
                  <span className="text-xs text-muted">points a day</span>
                  <button type="submit" className="pressable min-h-10 rounded-xl bg-violet-deep px-3 text-xs font-semibold">
                    Save
                  </button>
                </span>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 px-1 text-[11px] text-faint">Calls first: a real conversation counts 3, so 3 good calls a day is worth 9 texts.</p>
    </div>
  );
}
