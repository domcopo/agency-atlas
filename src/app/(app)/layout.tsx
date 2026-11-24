// Frame for every screen except sign-in. In database mode, only people listed in
// team_members get past this point; everyone else is sent to sign in.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/shell/BottomNav";
import { PreviewBanner } from "@/components/shell/PreviewBanner";
import { SideNav } from "@/components/shell/SideNav";
import { WorkOrdersButton } from "@/components/shell/WorkOrdersButton";
import Link from "next/link";
import { NoticePill } from "@/components/shell/NoticePill";
import { BrandLogo } from "@/components/shell/BrandLogo";
import { isLead, isSales } from "@/lib/roles";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { parseToadMode, TOAD_COOKIE } from "@/lib/toad";
import { BizToad } from "@/components/toad/BizToad";
import { getCoachHints, getDeveloperViewer, getMember, getNotices, getToadStatus, getWorkOrderBadge, usesDatabase } from "@/lib/data-source";

// AI briefings can take up to ~2 minutes; give server actions room on the host.
export const maxDuration = 180;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const member = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !member) redirect("/login?not-on-team=1");
  // A developer, or the owner/a manager previewing one: the developer screens and tabs.
  const viewer = await getDeveloperViewer();
  const developer = Boolean(viewer);
  const sales = isSales(member?.role);
  const [badge, notices] = await Promise.all([getWorkOrderBadge(), getNotices()]);
  const hints = developer || sales ? {} : (await getCoachHints()).tabs;
  const mode = developer ? "developer" : sales ? "sales" : "full";
  const ordersHref = developer ? "/work" : "/work/orders";
  const cookieJar = await cookies();
  // BizToad: shown, still, or tucked away on this device; the owner can switch it off for everyone (0030).
  const toad = await getToadStatus();
  // Off for everyone (owner's switch) = not shown at all. A person's own "tuck away" keeps him
  // peeking in the corner so he can be brought back.
  const toadOff = toad.ready && !toad.enabled;
  const toadMode = parseToadMode(cookieJar.get(TOAD_COOKIE)?.value);
  // Asking (Phase 2): owner and managers whose role is switched on, outside a preview.
  const toadAsk = toad.canAsk && isLead(member?.role) && !viewer?.preview ? { usedUsd: toad.myUsedUsd, capUsd: toad.perPersonUsd } : null;
  const toadNote = !usesDatabase()
    ? "Asking me needs the real database (this is the demo)."
    : !toad.ready && isLead(member?.role)
      ? "Asking me needs database update 0030 first."
      : undefined;
  const toadLinks = developer
    ? [{ label: "Your work", href: "/work" }]
    : sales
      ? [{ label: "Sales", href: "/sales" }]
      : [
          { label: "Today's briefing (Home)", href: "/" },
          { label: "Smart add a work order", href: "/work/orders" },
        ];
  // Phones and tablets: one narrow column with the bottom tab bar (unchanged).
  // From 1024 px (lg): a side menu on the left and a wide content area, capped at
  // 1600 px so lines don't stretch too far on big monitors.
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-xl focus:bg-violet-deep focus:px-4 focus:py-2 focus:text-sm focus:font-semibold">
        Skip to content
      </a>
      <SideNav
        hints={hints}
        mode={mode}
        workOrders={badge !== null ? { count: badge, href: ordersHref } : null}
        notices={notices ? notices.unread : null}
        showSafety={!developer && !sales}
        theme={parseTheme(cookieJar.get(THEME_COOKIE)?.value)}
      />
      <div className="lg:pl-60">
        <main id="main" className="wide mx-auto max-w-lg px-4 pb-44 lg:max-w-[100rem] lg:px-10 lg:pb-28 xl:px-14">
          {/* Phones and tablets: small logo at the top (computers have it in the side menu). */}
          <div className="-mb-2 flex items-center justify-between pt-4 lg:hidden">
            <Link href="/" className="inline-block">
              <BrandLogo className="w-[88px]" priority />
            </Link>
            {!toadOff && <BizToad variant="bar" initialMode={toadMode} links={toadLinks} ask={toadAsk} note={toadNote} />}
          </div>
          {viewer?.preview && <PreviewBanner name={viewer.name} />}
          {notices && notices.unread > 0 && <NoticePill count={notices.unread} />}
          {children}
        </main>
      </div>
      {badge !== null && <WorkOrdersButton count={badge} href={ordersHref} />}
      {/* Computers: bottom-right corner (main has extra bottom space so nothing ends up under it). */}
      {!toadOff && <BizToad variant="corner" initialMode={toadMode} links={toadLinks} ask={toadAsk} note={toadNote} />}
      <BottomNav hints={hints} mode={mode} />
    </>
  );
}
