import { Database, FlaskConical, Lock, LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import type { RosterSource } from "@/lib/types";

/** Always-visible notice of where the client data on screen comes from. */
export function DemoBanner({ source, memberName }: { source: RosterSource; memberName?: string }) {
  if (source === "database") {
    return (
      <div className="sticky top-0 z-40 border-b border-teal/30 bg-[#05221f]/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-1 text-xs font-semibold tracking-wide text-teal">
          <span className="flex items-center gap-2">
            <Database aria-hidden className="size-3.5" />
            {memberName ? `YOUR DATABASE · ${memberName.toUpperCase()}` : "YOUR DATABASE · SIGN IN"}
          </span>
          {memberName && (
            <form action={signOut}>
              <button type="submit" className="pressable flex min-h-8 items-center gap-1 rounded-lg px-2 text-teal/80 hover:text-teal">
                <LogOut aria-hidden className="size-3.5" /> Sign out
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }
  return source === "private_file" ? (
    <div className="sticky top-0 z-40 border-b border-teal/30 bg-[#05221f]/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <p className="mx-auto flex max-w-lg items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-teal">
        <Lock aria-hidden className="size-3.5" />
        REAL CLIENT LIST · THIS MAC ONLY
      </p>
    </div>
  ) : (
    <div className="sticky top-0 z-40 border-b border-amber/30 bg-[#2a1f05]/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <p className="mx-auto flex max-w-lg items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-amber">
        <FlaskConical aria-hidden className="size-3.5" />
        DEMO · MOCK DATA — nothing here is real
      </p>
    </div>
  );
}
