"use client";

// Bottom tab bar. A tab glows slowly (with a small count) when something there is
// worth checking, and stops once you've opened that tab, until something new
// comes in. Which tabs glow is decided on the server (getCoachHints).

import { BriefcaseBusiness, Gauge, Sprout, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/format";
import { useSeen } from "@/lib/use-seen";

const tabs = [
  { href: "/", label: "Home", icon: Gauge },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/sales", label: "Sales", icon: TrendingUp },
  { href: "/work", label: "Work", icon: BriefcaseBusiness },
  { href: "/growth", label: "Growth", icon: Sprout },
] as const;

export interface NavHint {
  count: number;
  signature: string | null;
  reason: string;
}

export function BottomNav({ hints = {}, developer = false }: { hints?: Record<string, NavHint>; developer?: boolean }) {
  const pathname = usePathname();
  // Developers only use Home and Work (the database enforces what they can read).
  const shown = developer ? tabs.filter((t) => t.href === "/" || t.href === "/work") : tabs;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className={`mx-auto mb-3 grid max-w-md ${developer ? "grid-cols-2" : "grid-cols-5"} rounded-[28px] border border-line bg-[#14111f]/95 px-1.5 py-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_12px_32px_-8px_rgb(0_0_0/0.8)] backdrop-blur-xl sm:mb-4`}>
        {shown.map((t) => (
          <NavItem
            key={t.href}
            tab={t}
            active={t.href === "/" ? pathname === "/" : pathname === t.href || pathname.startsWith(`${t.href}/`)}
            hint={hints[t.href]}
          />
        ))}
      </ul>
    </nav>
  );
}

function NavItem({
  tab: { href, label, icon: Icon },
  active,
  hint,
}: {
  tab: (typeof tabs)[number];
  active: boolean;
  hint?: NavHint;
}) {
  const { isNew, markSeen } = useSeen(`tab${href}`, hint?.signature ?? null);
  // Opening the tab counts as having looked.
  useEffect(() => {
    if (active) markSeen();
  }, [active, markSeen]);
  const glow = isNew && !active;

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        aria-label={glow && hint ? `${label}: ${hint.count} new. ${hint.reason}` : label}
        className={cn(
          "pressable relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[22px] text-[11px] font-medium",
          active
            ? "bg-gradient-to-b from-violet/35 to-violet-deep/25 text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]"
            : "text-muted hover:text-ink",
          glow && "coach text-ink",
        )}
      >
        {glow && hint && (
          <span aria-hidden className="absolute right-2 top-1 min-w-4 rounded-full bg-amber px-1 text-center text-[9px] font-bold leading-4 text-bg">
            {hint.count}
          </span>
        )}
        <Icon aria-hidden className="size-5" strokeWidth={active ? 2.4 : 2} />
        {label}
      </Link>
    </li>
  );
}
