import { FlaskConical, Lock } from "lucide-react";

/**
 * Always-visible notice of what's on screen. With the private client file loaded,
 * the client list is REAL (this Mac only) and everything else is sample data.
 */
export function DemoBanner({ realClients }: { realClients: boolean }) {
  return realClients ? (
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
