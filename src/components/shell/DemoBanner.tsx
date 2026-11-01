import { FlaskConical } from "lucide-react";

/** Always-visible notice that nothing on screen is real. Shown on every page. */
export function DemoBanner() {
  return (
    <div className="sticky top-0 z-40 border-b border-amber/30 bg-[#2a1f05]/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <p className="mx-auto flex max-w-lg items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-amber">
        <FlaskConical aria-hidden className="size-3.5" />
        DEMO · MOCK DATA — nothing here is real
      </p>
    </div>
  );
}
