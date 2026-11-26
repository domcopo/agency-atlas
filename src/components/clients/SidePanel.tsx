"use client";

// The right-side panel on the Clients page: By service, Client health, Win back and the
// owner's "Owners & next steps". Collapsed by default; Esc or the header button closes it.

import { ChevronRight, PanelRightOpen } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

export function SidePanel({ summary, children }: { summary: string; children: ReactNode }) {
  // Closed on every visit (it slides over the page when open on computers).
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);
  return (
    <aside
      aria-label="More about clients"
      onKeyDown={(e) => {
        if (open && e.key === "Escape") toggle();
      }}
      className={cn(
        "mt-5 lg:mt-0",
        // Computers: a slim rail; when open it slides over the right side of the page.
        open
          ? "jl-drawer-in lg:fixed lg:inset-y-3 lg:right-3 lg:z-40 lg:w-[360px] lg:overflow-y-auto lg:rounded-3xl lg:border lg:border-line lg:bg-bg-raised lg:p-3 lg:shadow-[0_20px_60px_-20px_rgb(0_0_0/0.7)]"
          : "lg:sticky lg:top-4 lg:w-12 lg:self-start",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="side-panel-body"
        className={cn(
          "pressable glass flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl px-4 text-left text-sm font-semibold",
          !open && "lg:h-auto lg:min-h-48 lg:flex-col lg:justify-start lg:px-0 lg:py-3",
        )}
      >
        <span className={cn("flex items-center gap-2", !open && "lg:flex-col")}>
          <PanelRightOpen aria-hidden className={cn("size-4 text-violet transition-transform", open && "rotate-180")} />
          <span className={cn(!open && "lg:[writing-mode:vertical-rl]")}>
            {open ? "Services, health & win back" : "More"}
            <span className={cn("ml-2 text-[11px] font-normal text-faint", !open && "lg:ml-0 lg:mt-2")}>{summary}</span>
          </span>
        </span>
        <ChevronRight aria-hidden className={cn("size-4 text-faint transition-transform lg:hidden", open && "rotate-90")} />
      </button>
      <div id="side-panel-body" hidden={!open} className="mt-1">
        {children}
      </div>
    </aside>
  );
}
