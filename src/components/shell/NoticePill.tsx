// "N new notices" pill at the top of every screen, only when something actually changed.
import { Bell } from "lucide-react";
import Link from "next/link";

export function NoticePill({ count }: { count: number }) {
  return (
    <Link href="/notifications" className="pressable mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-violet/50 bg-violet/15 px-3 text-xs font-semibold">
      <Bell aria-hidden className="size-3.5 text-violet" />
      {count} new {count === 1 ? "notice" : "notices"}
    </Link>
  );
}
