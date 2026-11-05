// Owner only: confirm which GoHighLevel contact is which client, so call/message
// TIMES can be read for them. Suggestions come from the Sync; nothing is linked
// until you confirm. Message text is never read.

import { Check, Link2, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { decideContactMatch } from "@/app/actions";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { PageHeader } from "@/components/shell/PageHeader";
import { getContactMatches, getMember, usesDatabase } from "@/lib/data-source";

export const metadata: Metadata = { title: "Match GoHighLevel contacts" };

const btn = "pressable inline-flex min-h-10 items-center gap-1 rounded-xl border px-3 text-xs font-semibold";

function Decide({ clientId, contactId, decision, children, tone }: { clientId: string; contactId: string; decision: "confirm" | "reject" | "link"; children: React.ReactNode; tone: string }) {
  return (
    <form action={decideContactMatch}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="contactId" value={contactId} />
      <input type="hidden" name="decision" value={decision} />
      <button type="submit" className={`${btn} ${tone}`}>
        {children}
      </button>
    </form>
  );
}

export default async function MatchesPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (me?.role !== "owner") return <RoleNotice title="Match contacts" />;
  const { ready, rows } = await getContactMatches();
  const todo = rows.filter((r) => !r.confirmed).length;
  return (
    <>
      <PageHeader title="Match contacts" subtitle={`${rows.length - todo} of ${rows.length} clients matched`} backHref="/clients" backLabel="Clients" />
      <p className="mb-3 rounded-2xl border border-line bg-white/[0.03] p-3.5 text-xs text-muted">
        Confirm which GoHighLevel contact is each client. The app then reads <span className="text-ink">when</span> they were last
        called or messaged (never what was said). Suggestions come from pressing Sync on Data Safety.
      </p>
      {!ready ? (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Run the 0008 setup step in Supabase first.</p>
      ) : (
        <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {rows.map(({ client: c, confirmed, suggestions }) => (
            <li key={c.id} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/clients/${c.id}`} className="text-sm font-semibold hover:underline">
                  {c.name}
                </Link>
                <span className="text-xs text-muted">${c.monthlyUsd.toLocaleString("en-US")}/mo</span>
              </div>
              {confirmed ? (
                <p className="flex items-center gap-1.5 text-xs text-lime">
                  <Check aria-hidden className="size-3.5" /> Matched: {confirmed.name ?? confirmed.id}
                </p>
              ) : suggestions.length ? (
                <ul className="space-y-1.5">
                  {suggestions.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs">Is it <span className="font-semibold">{s.name ?? s.id}</span>?</span>
                      <span className="flex gap-1.5">
                        <Decide clientId={c.dbId!} contactId={s.id} decision="confirm" tone="border-lime/40 text-lime">
                          <Check aria-hidden className="size-3.5" /> Yes
                        </Decide>
                        <Decide clientId={c.dbId!} contactId={s.id} decision="reject" tone="border-line text-muted">
                          <X aria-hidden className="size-3.5" /> No
                        </Decide>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-amber">No suggestion yet. Press Sync, or link it by hand below.</p>
              )}
              {!confirmed && (
                <details>
                  <summary className="pressable flex min-h-9 cursor-pointer list-none items-center gap-1 text-[11px] text-violet">
                    <Link2 aria-hidden className="size-3" /> Link by contact ID
                  </summary>
                  <form action={decideContactMatch} className="mt-1.5 flex gap-1.5">
                    <input type="hidden" name="clientId" value={c.dbId} />
                    <input type="hidden" name="decision" value="link" />
                    <input
                      name="contactId"
                      required
                      pattern="[A-Za-z0-9]{6,40}"
                      placeholder="ID from the contact's GoHighLevel address"
                      aria-label={`GoHighLevel contact ID for ${c.name}`}
                      className="min-h-10 flex-1 rounded-xl border border-line bg-white/5 px-2 text-sm"
                    />
                    <button type="submit" className={`${btn} border-violet/40 text-violet`}>
                      Link
                    </button>
                  </form>
                  <p className="mt-1 text-[11px] text-faint">In GoHighLevel, open the contact. The ID is the last part of the address: …/contacts/detail/<span className="text-muted">THIS-PART</span></p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
