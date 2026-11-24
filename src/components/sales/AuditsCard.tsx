// Sales tab: the 3 newest saved audits and "New audit". Read through data-source, so the
// database decides which audits come back (a salesperson: only their own).

import { FileSearch, Plus } from "lucide-react";
import Link from "next/link";
import { SectionTitle } from "@/components/shell/PageHeader";
import { getAudits } from "@/lib/data-source";
import { formatShortDate } from "@/lib/format";

export async function AuditsCard({ mine }: { mine: boolean }) {
  const { ready, audits } = await getAudits();
  const open = audits.filter((a) => !a.archived);
  return (
    <section>
      <SectionTitle aside={<Link href="/sales/audits" className="font-semibold text-violet">All audits</Link>}>{mine ? "My audits" : "SEO audits"}</SectionTitle>
      <div className="glass overflow-hidden rounded-3xl">
        {ready && open.length > 0 && (
          <ul className="divide-y divide-line">
            {open.slice(0, 3).map((a) => (
              <li key={a.id}>
                <Link href={`/sales/audits/${a.id}`} className="pressable flex min-h-12 items-center gap-3 px-4 py-2.5">
                  <FileSearch aria-hidden className="size-4 shrink-0 text-teal" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{a.intake?.company ?? a.title}</span>
                    <span className="block truncate text-[11px] text-faint">
                      {a.intake?.domain ?? ""} · {formatShortDate(a.createdAt.slice(0, 10))}
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
          <Link href="/sales/audits/new" className="pressable inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-violet-deep text-sm font-semibold">
            <Plus aria-hidden className="size-4" /> New audit
          </Link>
        </div>
      </div>
    </section>
  );
}
