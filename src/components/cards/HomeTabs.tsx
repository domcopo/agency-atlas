"use client";

// A row of small "cockpit" buttons on the home screen. Each shows an icon, one
// number and a label. Tapping one opens its panel below; tapping it again (or
// another button) closes it. Only one panel is open at a time.
// The panels are built on the server and passed in, so this file only handles
// open/closed. It never fetches or changes data.

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { useSeen } from "@/lib/use-seen";

export interface HomeTab {
  id: string;
  /** Short label, e.g. "Results". */
  label: string;
  icon: ReactNode;
  /** One short number, e.g. "14" or "$5.4k". */
  stat: string;
  /** Spoken to screen readers after the number, e.g. "prospects to work". */
  statLabel: string;
  /** Amber indicator light when something needs action. */
  attention?: boolean;
  /** Set when something new is worth checking: the button glows until opened. */
  coachSignature?: string | null;
  panel: ReactNode;
}

export function HomeTabs({ tabs }: { tabs: HomeTab[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const baseId = useId();
  const active = tabs.find((t) => t.id === open);

  return (
    <section aria-label="Dashboard buttons">
      <div className="grid grid-cols-4 gap-2">
        {tabs.map((t) => (
          <CockpitButton
            key={t.id}
            tab={t}
            isOpen={open === t.id}
            panelId={`${baseId}-panel`}
            onToggle={() => setOpen(open === t.id ? null : t.id)}
          />
        ))}
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

function CockpitButton({
  tab: t,
  isOpen,
  panelId,
  onToggle,
}: {
  tab: HomeTab;
  isOpen: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  const { isNew, markSeen } = useSeen(`home-${t.id}`, t.coachSignature ?? null);
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={panelId}
      aria-label={`${t.label}: ${t.stat} ${t.statLabel}${isNew ? ". New, worth checking" : ""}`}
      onClick={() => {
        onToggle();
        markSeen();
      }}
      className={cn(
        "pressable relative flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2",
        "bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]",
        isOpen ? "border-violet/70 bg-violet/15" : "border-line",
        isNew && !isOpen && "coach",
      )}
    >
      {/* Indicator light, like a cockpit switch: amber = needs action, violet = open. */}
      <span
        aria-hidden
        className={cn(
          "absolute right-1.5 top-1.5 size-1.5 rounded-full",
          isOpen ? "bg-violet shadow-[0_0_6px_rgb(176_124_255)]" : t.attention ? "bg-amber shadow-[0_0_6px_rgb(251_191_74)]" : "bg-white/15",
        )}
      />
      <span aria-hidden className={cn("[&>svg]:size-4", t.attention ? "text-amber" : "text-violet")}>
        {t.icon}
      </span>
      <span aria-hidden className="font-display text-[15px] font-bold leading-none">
        {t.stat}
      </span>
      <span aria-hidden className="text-[10px] font-semibold uppercase leading-none tracking-wide text-muted">
        {t.label}
      </span>
    </button>
  );
}
