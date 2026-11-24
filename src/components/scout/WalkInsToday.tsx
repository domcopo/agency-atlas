// A salesperson's Home: "Walk-ins today" from Scout — their not-yet-visited prospects,
// best first, in route order, with one Google Maps route link. Hidden when there are none
// (or before 0024). Read through data-source, so the database decides what comes back.

import { Route } from "lucide-react";
import Link from "next/link";
import { ProspectRow } from "@/components/scout/ProspectRow";
import { SectionTitle } from "@/components/shell/PageHeader";
import { getScout } from "@/lib/data-source";
import { mapsRouteUrl, walkInsToday } from "@/lib/scout";

export async function WalkInsToday() {
  const scout = await getScout();
  if (!scout.ready) return null;
  const stops = walkInsToday(scout.prospects, scout.me);
  if (!stops.length) return null;
  const route = mapsRouteUrl(stops);
  return (
    <section>
      <SectionTitle aside={<Link href="/sales/scout" className="font-semibold text-violet">Scout</Link>}>Walk-ins today</SectionTitle>
      <div className="glass overflow-hidden rounded-3xl">
        {route && (
          <a href={route} target="_blank" rel="noopener noreferrer" className="pressable flex min-h-12 items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-semibold text-teal">
            <Route aria-hidden className="size-4" /> Open the route in Google Maps ({stops.length} stops)
          </a>
        )}
        <ol className="divide-y divide-line">
          {stops.map((p) => (
            <li key={p.id}>
              <ProspectRow p={p} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
