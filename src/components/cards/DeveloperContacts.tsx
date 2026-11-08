// Developers: when each of THEIR clients was last contacted, and plain flags like
// "client reached out 3 days ago; no reply yet". Dates only: no notes, no message
// text, no money (the database view returns nothing else).

import { contactSummary, type ClientContactDates } from "@/lib/ops";
import { cn } from "@/lib/format";

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function DeveloperContacts({ contacts, today }: { contacts: ClientContactDates[]; today: string }) {
  if (!contacts.length) return null;
  return (
    <section aria-label="Your clients: last contact" className="mt-5">
      <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Your clients · last contact</h2>
      <ul className="glass divide-y divide-line rounded-3xl">
        {contacts.map((c) => {
          const s = contactSummary(c, today);
          return (
            <li key={c.slug} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold">{c.name}</span>
                <span className={cn("shrink-0 text-xs", s.daysSince === null ? "text-faint" : s.daysSince > 14 ? "text-amber" : "text-muted")}>
                  {s.lastContact ? `${shortDay(s.lastContact)} · ${s.daysSince === 0 ? "today" : `${s.daysSince}d ago`}` : "No contact recorded"}
                </span>
              </div>
              {s.flags.map((f) => (
                <p key={f} className="mt-0.5 text-[11px] text-rose">
                  {f}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 px-1 text-[11px] text-faint">Dates from the app and GoHighLevel (times only). Talk to the client&apos;s manager before contacting a client.</p>
    </section>
  );
}
