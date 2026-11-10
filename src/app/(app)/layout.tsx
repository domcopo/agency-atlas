// Frame for every screen except sign-in. In database mode, only people listed in
// team_members get past this point; everyone else is sent to sign in.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/shell/BottomNav";
import { PreviewBanner } from "@/components/shell/PreviewBanner";
import { getCoachHints, getDeveloperViewer, getMember, usesDatabase } from "@/lib/data-source";

// AI briefings can take up to ~2 minutes; give server actions room on the host.
export const maxDuration = 180;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const member = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !member) redirect("/login?not-on-team=1");
  // A developer, or the owner/a manager previewing one: the developer screens and tabs.
  const viewer = await getDeveloperViewer();
  const developer = Boolean(viewer);
  return (
    <>
      <main className="mx-auto max-w-lg px-4 pb-32">
        {viewer?.preview && <PreviewBanner name={viewer.name} />}
        {children}
      </main>
      <BottomNav hints={developer ? {} : (await getCoachHints()).tabs} developer={developer} />
    </>
  );
}
