// Home layout chips (owner and managers). Arranges Home only; permissions never change.
import { setHomeLayout } from "@/app/actions";
import { cn } from "@/lib/format";
import { HOME_LAYOUT_LABEL, HOME_LAYOUTS, type HomeLayout } from "@/lib/home-layouts";

export function HomeSwitcher({ current }: { current: HomeLayout }) {
  return (
    <form action={setHomeLayout} aria-label="Home layout" className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {HOME_LAYOUTS.map((l) => (
        <button
          key={l}
          type="submit"
          name="layout"
          value={l}
          aria-pressed={l === current}
          className={cn(
            "pressable min-h-10 shrink-0 rounded-full border px-3.5 text-xs font-semibold",
            l === current ? "border-violet/60 bg-violet/20 text-ink" : "border-line bg-white/5 text-muted",
          )}
        >
          {HOME_LAYOUT_LABEL[l]}
        </button>
      ))}
    </form>
  );
}
