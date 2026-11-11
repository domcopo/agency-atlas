// Floating Work Orders button, bottom-right just above the tab bar (the one corner that
// covers no buttons on a phone). The badge counts overdue or urgent open work orders.
import { ClipboardList } from "lucide-react";
import Link from "next/link";

export function WorkOrdersButton({ count, href }: { count: number; href: string }) {
  return (
    <Link
      href={href}
      aria-label={count ? `Work orders: ${count} overdue or urgent` : "Work orders"}
      className="pressable fixed right-4 z-40 flex size-14 items-center justify-center rounded-full border border-violet/50 bg-violet-deep shadow-[0_10px_30px_-8px_rgb(124_58_237/0.8)] bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] sm:right-[max(1rem,calc(50%-15rem))]"
    >
      <ClipboardList aria-hidden className="size-6 text-white" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex min-w-6 items-center justify-center rounded-full border-2 border-bg bg-rose px-1.5 text-[11px] font-bold leading-5 text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
