"use client";

// Three tiles in a row on the home screen. Tapping one opens its panel below;
// tapping it again (or another tile) closes it. Only one panel is open at a time.
// The panels' contents are built on the server and passed in, so this file only
// handles open/closed — it never fetches or changes data.

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

export interface HomeTab {
  id: string;
  label: string;
  icon: ReactNode;
  /** Big number on the tile, e.g. "14" or "5". */
  stat: string;
  /** Small words under the number, e.g. "to work". */
  statLabel: string;
  /** Draws attention (gold glow) when something needs action. */
  attention?: boolean;
  panel: ReactNode;
}

export function HomeTabs({ tabs }: { tabs: HomeTab[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const baseId = useId();
  const active = tabs.find((t) => t.id === open);

  return (
    <section aria-label="Sales, follow-ups and conversations">
      <div className="grid grid-cols-3 gap-2.5">
        {tabs.map((t) => {
          const isOpen = open === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-expanded={isOpen}
              aria-controls={`${baseId}-panel`}
              onClick={() => setOpen(isOpen ? null : t.id)}
              className={cn(
                "glass pressable shimmer flex min-h-[104px] flex-col justify-between rounded-3xl p-3 text-left",
                isOpen && "border-violet/60 bg-violet/15",
                t.attention && !isOpen && "border-amber/40",
              )}
            >
              <span className="flex items-center justify-between text-muted">
                <span className={cn("[&>svg]:size-4", t.attention ? "text-amber" : "text-violet")}>
                  {t.icon}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn("size-4 transition-transform duration-200", isOpen && "rotate-180")}
                />
              </span>
              <span>
                <span className="block font-display text-2xl font-bold leading-none">{t.stat}</span>
                <span className="mt-0.5 block text-[10px] leading-tight text-faint">{t.statLabel}</span>
              </span>
              <span className="text-[13px] font-semibold">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-panel`} role="region" aria-label={active ? `${active.label} details` : undefined}>
        {active && (
          <div key={active.id} className="animate-rise-in mt-3">
            {active.panel}
          </div>
        )}
      </div>
    </section>
  );
}
