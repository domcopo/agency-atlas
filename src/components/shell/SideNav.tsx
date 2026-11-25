"use client";

// Side menu for wide screens (1024 px and up). Phones and tablets keep the bottom tab
// bar; this is hidden below 1024 px. It reads the same tab list and MODE_TABS as the
// bottom bar, so the two can't drift apart, and the same "something new" glow
// (useSeen), so opening a tab stops it glowing on both. Which tabs show is only a
// convenience: the database decides what each role can actually read.

import { Bell, ChartLine, ClipboardList, FileSearch, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, type ComponentType } from "react";
import { cn } from "@/lib/format";
import { useSeen } from "@/lib/use-seen";
import type { Theme } from "@/lib/theme";
import { BrandLogo } from "./BrandLogo";
import { ThemeToggle } from "./ThemeToggle";
import { MODE_TABS, tabs, type NavHint, type NavMode } from "./BottomNav";

interface SideNavProps {
  hints?: Record<string, NavHint>;
  mode?: NavMode;
  /** Overdue or urgent open work orders; null hides the link (same rule as the floating button). */
  workOrders: { count: number; href: string } | null;
  /** Unread notices; null when notices aren't available. */
  notices: number | null;
  /** Data Safety link: shown to the same people who see the shield on Home. */
  showSafety: boolean;
  /** Saved light/dark choice, for the switch at the bottom. */
  theme: Theme;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The SEO Watcher has its own row under Growth, so Growth isn't lit while you're in it. */
const WATCHER = "/growth/watcher";

export function SideNav({ hints = {}, mode = "full", workOrders, notices, showSafety, theme }: SideNavProps) {
  const pathname = usePathname();
  const only = MODE_TABS[mode];
  const shown = only ? tabs.filter((t) => only.includes(t.href)) : tabs;

  return (
    <nav
      aria-label="Main"
      data-side-nav
      className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-line bg-panel/95 px-3 pb-5 pt-6 backdrop-blur-xl lg:flex"
    >
      <Link href="/" className="pressable mb-6 flex items-center rounded-2xl px-3 py-1">
        <BrandLogo className="w-36" priority />
      </Link>

      <ul className="space-y-1">
        {shown.map((t) => (
          <Fragment key={t.href}>
            <TabItem tab={t} active={isActive(pathname, t.href) && !(t.href === "/growth" && isActive(pathname, WATCHER))} hint={hints[t.href]} />
            {/* Audits sits under Sales (computers only; on phones it's a card at the top of Sales). */}
            {t.href === "/sales" && <PlainItem href="/audits" label="Audits" icon={FileSearch} active={isActive(pathname, "/audits")} />}
            {/* SEO Watcher sits under Growth (computers only; on phones it's a card at the top of Growth). */}
            {t.href === "/growth" && <PlainItem href={WATCHER} label="SEO Watcher" icon={ChartLine} active={isActive(pathname, WATCHER)} />}
          </Fragment>
        ))}
      </ul>

      <ul className="mt-6 space-y-1 border-t border-line pt-6">
        {workOrders && (
          <PlainItem
            href={workOrders.href}
            label="Work orders"
            icon={ClipboardList}
            active={pathname.startsWith("/work/orders")}
            count={workOrders.count}
            countLabel="overdue or urgent"
            tone="rose"
          />
        )}
        {notices !== null && (
          <PlainItem href="/notifications" label="Notices" icon={Bell} active={isActive(pathname, "/notifications")} count={notices} countLabel="new" tone="violet" />
        )}
        {showSafety && <PlainItem href="/safety" label="Data Safety" icon={ShieldCheck} active={isActive(pathname, "/safety")} iconClass="text-lime" />}
        <PlainItem href="/account" label="Account" icon={UserRound} active={isActive(pathname, "/account")} />
      </ul>

      <ThemeToggle initial={theme} />
    </nav>
  );
}

const rowClass = (active: boolean) =>
  cn(
    "pressable relative flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium",
    active
      ? "bg-gradient-to-b from-violet/35 to-violet-deep/25 text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]"
      : "text-muted hover:bg-white/[0.06] hover:text-ink",
  );

function TabItem({ tab: { href, label, icon: Icon }, active, hint }: { tab: (typeof tabs)[number]; active: boolean; hint?: NavHint }) {
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
        aria-label={glow && hint ? `${label}: ${hint.count} new. ${hint.reason}` : undefined}
        title={glow && hint ? hint.reason : undefined}
        className={cn(rowClass(active), glow && "coach text-ink")}
      >
        <Icon aria-hidden className="size-5 shrink-0" strokeWidth={active ? 2.4 : 2} />
        <span className="flex-1">{label}</span>
        {glow && hint && (
          <span aria-hidden className="min-w-5 rounded-full bg-amber px-1.5 text-center text-[11px] font-bold leading-5 text-bg">
            {hint.count}
          </span>
        )}
      </Link>
    </li>
  );
}

function PlainItem({
  href,
  label,
  icon: Icon,
  active,
  count = 0,
  countLabel,
  tone,
  iconClass,
}: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  active: boolean;
  count?: number;
  countLabel?: string;
  tone?: "rose" | "violet";
  iconClass?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        aria-label={count > 0 && countLabel ? `${label}: ${count} ${countLabel}` : undefined}
        className={rowClass(active)}
      >
        <Icon aria-hidden className={cn("size-5 shrink-0", iconClass)} />
        <span className="flex-1">{label}</span>
        {count > 0 && (
          <span aria-hidden className={cn("min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5", tone === "rose" ? "bg-rose text-[#fff]" : "bg-violet/30 text-ink")}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </li>
  );
}
