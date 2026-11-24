// Sales tab: Scout at a glance and the way in. Read through data-source, so the database
// decides what comes back (a salesperson: their own prospects + the unclaimed pool).

import { MapPinned } from "lucide-react";
import Link from "next/link";
import { SectionTitle } from "@/components/shell/PageHeader";
import { getScout } from "@/lib/data-source";
import { isOpenProspect, nyMonthStart } from "@/lib/scout";

export async function ScoutCard() {
  const scout = await getScout();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const open = scout.prospects.filter((p) => isOpenProspect(p, today));
  const mine = open.filter((p) => p.assignedTo === scout.me);
  const pool = open.filter((p) => p.assignedTo === null);
  const month = nyMonthStart(new Date());
  const visitsMonth = scout.visits.filter((v) => nyMonthStart(new Date(v.at)) === month).length;
  return (
    <section>
      <SectionTitle aside={<Link href="/sales/scout" className="font-semibold text-violet">Open Scout</Link>}>Scout</SectionTitle>
      <Link href="/sales/scout" className="pressable glass block rounded-3xl p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MapPinned aria-hidden className="size-4 text-teal" /> Local businesses worth a visit
        </p>
        {!scout.ready ? (
          <p className="mt-1 text-sm text-muted">Scout needs one setup step first (0024 SQL).</p>
        ) : (
          <p className="mt-1 text-sm text-muted">
            {scout.role === "sales" ? `${mine.length} on your list · ${pool.length} in the shared pool` : `${open.length} open prospects · ${pool.length} not given out yet`} · {visitsMonth} visits/calls this month
          </p>
        )}
      </Link>
    </section>
  );
}
