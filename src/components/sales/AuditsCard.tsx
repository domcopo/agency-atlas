// Sales tab and audits. AuditDoors: phones only, at the top of Sales, the two kinds of
// audit (on computers the side menu has "Audits"). AuditsCard: the 3 newest saved audits.
// Read through data-source, so the database decides which audits come back (a
// salesperson: only their own).

import { ChevronRight, FileSearch, MousePointerClick, Plus } from "lucide-react";
import Link from "next/link";
import { SectionTitle } from "@/components/shell/PageHeader";
import { getAudits } from "@/lib/data-source";
import { formatShortDate } from "@/lib/format";

export function AuditDoors() {
  return (
    <section aria-label="Audits" className="glass mb-4 rounded-3xl p-3 lg:hidden">
      <Link href="/audits" className="pressable flex min-h-10 items-center justify-between px-1 text-sm font-semibold">
        Audits <span className="flex items-center text-xs font-semibold text-violet">All audits <ChevronRight aria-hidden className="size-4" /></span>
      </Link>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <Link href="/audits/seo" className="pressable flex min-h-16 flex-col justify-center gap-1 rounded-2xl border border-line bg-white/5 px-3 py-2">
          <FileSearch aria-hidden className="size-5 text-teal" />
          <span className="text-sm font-semibold">SEO audit</span>
        </Link>
        <Link href="/audits/ads" className="pressable flex min-h-16 flex-col justify-center gap-1 rounded-2xl border border-line bg-white/5 px-3 py-2">
          <MousePointerClick aria-hidden className="size-5 text-amber" />
          <span className="text-sm font-semibold">
            Google Ads audit
          </span>
        </Link>
      </div>
    </section>
  );
}

export async function AuditsCard({ mine }: { mine: boolean }) {
  const { ready, audits } = await getAudits();
  const open = audits.filter((a) => !a.archived);
  return (
    <section>
      <SectionTitle aside={<Link href="/audits" className="font-semibold text-violet">All audits</Link>}>{mine ? "My audits" : "Recent audits"}</SectionTitle>
      <div className="glass overflow-hidden rounded-3xl">
        {ready && open.length > 0 && (
          <ul className="divide-y divide-line">
            {open.slice(0, 3).map((a) => (
              <li key={a.id}>
                <Link href={`/audits/${a.id}`} className="pressable flex min-h-12 items-center gap-3 px-4 py-2.5">
                  {a.kind === "ads" ? <MousePointerClick aria-hidden className="size-4 shrink-0 text-amber" /> : <FileSearch aria-hidden className="size-4 shrink-0 text-teal" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{a.base?.company ?? a.title}</span>
                    <span className="block truncate text-[11px] text-faint">
                      {a.kind === "ads" ? "Google Ads" : "SEO"} · {a.base?.domain ?? ""} · {formatShortDate(a.createdAt.slice(0, 10))}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {ready && open.length === 0 && <p className="px-4 pt-3 text-sm text-muted">Build a custom SEO audit for a lead or any business.</p>}
        {!ready && <p className="px-4 pt-3 text-sm text-muted">Saving audits needs one setup step first (0023 SQL).</p>}
        <div className="p-3">
          <Link href="/audits/seo/new" className="pressable inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-violet-deep text-sm font-semibold">
            <Plus aria-hidden className="size-4" /> New SEO audit
          </Link>
        </div>
      </div>
    </section>
  );
}
