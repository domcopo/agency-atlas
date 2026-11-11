// My notices (0017): written only by the database when something about my work changes.
// In-app only: Atlas never texts, emails or pings anyone, and nothing repeats or nags.
import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { markNoticesRead } from "@/app/actions";
import { NoticeMutesForm } from "@/components/forms/NoticeMutesForm";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getMember, getNotices, NOTICE_KINDS, type Notice } from "@/lib/data-source";
import { cn } from "@/lib/format";

export const metadata: Metadata = { title: "Notices" };

const LABEL: Record<Notice["kind"], string> = {
  assigned: "Assigned to you",
  unassigned: "Reassigned to someone else",
  due_changed: "Due date changed",
  comment: "New comment",
  reassign_request: "Asks to be reassigned",
  due_tomorrow: "Due tomorrow",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default async function NotificationsPage() {
  const [notices, me] = await Promise.all([getNotices(), getMember()]);
  if (!notices) {
    return (
      <>
        <PageHeader title="Notices" />
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Notices turn on after the 0017 setup step.</p>
      </>
    );
  }
  const kinds = NOTICE_KINDS.filter((k) => k.who === "everyone" || (k.who === "owner" && me?.role === "owner"));
  return (
    <>
      <PageHeader title="Notices" subtitle="Changes to your work orders. In Atlas only; nothing is texted or emailed." />
      {notices.unread > 0 && (
        <form action={markNoticesRead} className="mb-3">
          <button type="submit" className="pressable min-h-11 rounded-xl border border-line bg-white/5 px-4 text-sm font-semibold">
            Mark all as read
          </button>
        </form>
      )}
      {notices.items.length ? (
        <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {notices.items.map((n) => {
            const body = (
              <span className="flex items-start gap-3">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-white/15" : n.kind === "due_tomorrow" ? "bg-due-orange" : "bg-violet")} aria-label={n.read ? "Read" : "New"} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-muted">
                    {LABEL[n.kind]} · {n.kind === "due_tomorrow" ? "tomorrow" : when(n.at)}
                  </span>
                  <span className={cn("block text-sm", n.read ? "text-muted" : "font-semibold")}>{n.title}</span>
                </span>
              </span>
            );
            // A work order reassigned away can't be opened any more, so it isn't a link.
            return (
              <li key={n.id}>
                {n.actionId && n.kind !== "unassigned" ? (
                  <Link href={`/work/orders/${n.actionId}`} className="pressable block px-4 py-3">
                    {body}
                  </Link>
                ) : (
                  <div className="px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="glass flex items-center gap-2 rounded-3xl px-4 py-3 text-sm text-muted">
          <Bell aria-hidden className="size-4" /> Nothing yet. You&apos;ll see a notice here when a work order is assigned to you, changes, or gets a comment.
        </p>
      )}
      <SectionTitle>Mute</SectionTitle>
      <NoticeMutesForm kinds={kinds} muted={notices.muted} />
    </>
  );
}
