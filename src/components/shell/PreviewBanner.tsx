// "Preview as developer" banner: on every screen while previewing, with Exit.
import { Eye } from "lucide-react";
import { stopPreview } from "@/app/actions";
import { PREVIEW_MINUTES } from "@/lib/preview";

export function PreviewBanner({ name }: { name: string }) {
  return (
    <div role="status" className="sticky top-0 z-50 -mx-4 mb-1 flex items-center gap-2 border-b border-amber/50 bg-[#2a1f05]/95 px-4 py-2 text-xs backdrop-blur">
      <Eye aria-hidden className="size-4 shrink-0 text-amber" />
      <p className="min-w-0 flex-1 text-amber">
        <span className="font-semibold">Previewing as {name}</span> (developer view) · look only · ends after {PREVIEW_MINUTES} min
      </p>
      <form action={stopPreview}>
        <button type="submit" className="pressable min-h-9 rounded-lg border border-amber/50 bg-amber/15 px-3 font-semibold text-amber">
          Exit
        </button>
      </form>
    </div>
  );
}
