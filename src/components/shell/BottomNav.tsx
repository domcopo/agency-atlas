"use client";

import { BriefcaseBusiness, Gauge, Sprout, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

const tabs = [
  { href: "/", label: "Home", icon: Gauge },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/sales", label: "Sales", icon: TrendingUp },
  { href: "/work", label: "Work", icon: BriefcaseBusiness },
  { href: "/growth", label: "Growth", icon: Sprout },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto mb-3 grid max-w-md grid-cols-5 rounded-[28px] border border-line bg-[#14111f]/95 px-1.5 py-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_12px_32px_-8px_rgb(0_0_0/0.8)] backdrop-blur-xl sm:mb-4">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "pressable flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[22px] text-[11px] font-medium",
                  active
                    ? "bg-gradient-to-b from-violet/35 to-violet-deep/25 text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]"
                    : "text-muted hover:text-ink",
                )}
              >
                <Icon aria-hidden className="size-5" strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
