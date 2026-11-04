// Frame for every screen except sign-in. In database mode, only people listed in
// team_members get past this point; everyone else is sent to sign in.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/shell/BottomNav";
import { getCoachHints, getMember, usesDatabase } from "@/lib/data-source";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (usesDatabase() && !(await getMember())) redirect("/login?not-on-team=1");
  return (
    <>
      <main className="mx-auto max-w-lg px-4 pb-32">{children}</main>
      <BottomNav hints={(await getCoachHints()).tabs} />
    </>
  );
}
