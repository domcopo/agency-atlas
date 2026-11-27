"use client";

// The "⋯" menu on a Work row: opens a small panel with the less common actions.
// Only the opening and closing happen here; the buttons inside are plain forms that post
// to the same server actions as before (the server and database check who may do what).

import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="pressable flex size-10 items-center justify-center rounded-xl text-muted hover:bg-white/[0.06] hover:text-ink lg:size-9"
      >
        <MoreHorizontal aria-hidden className="size-5" />
      </button>
      {open && (
        <div id={panelId} role="group" aria-label={label} className="absolute right-0 top-full z-30 mt-1 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-panel p-2 shadow-2xl shadow-black/40">
          {children}
        </div>
      )}
    </div>
  );
}
