// Frame for every screen except sign-in. In database mode, only people listed in
// team_members get past this point; everyone else is sent to sign in.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/shell/BottomNav";
import { PreviewBanner } from "@/components/shell/PreviewBanner";
import { SideNav } from "@/components/shell/SideNav";
import { WorkOrdersButton } from "@/components/shell/WorkOrdersButton";
import Link from "next/link";
import { NoticePill } from "@/components/shell/NoticePill";
import { BrandLogo } from "@/components/shell/BrandLogo";
import { isSales } from "@/lib/roles";
import { getCoachHints, getDeveloperViewer, getMember, getNotices, getWorkOrderBadge, usesDatabase } from "@/lib/data-source";

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
      />
      <div className="lg:pl-60">
        <main id="main" className="wide mx-auto max-w-lg px-4 pb-44 lg:max-w-[100rem] lg:px-10 lg:pb-20 xl:px-14">
          {/* Phones and tablets: small logo at the top (computers have it in the side menu). */}
          <Link href="/" className="-mb-2 inline-block pt-4 lg:hidden">
            <BrandLogo className="w-[88px]" priority />
          </Link>
          {viewer?.preview && <PreviewBanner name={viewer.name} />}
          {notices && notices.unread > 0 && <NoticePill count={notices.unread} />}
          {children}
        </main>
      </div>
      {badge !== null && <WorkOrdersButton count={badge} href={ordersHref} />}
      <BottomNav hints={hints} mode={mode} />
    </>
  );
}
