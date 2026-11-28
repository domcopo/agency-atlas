"use client";

// Full-screen overlay (the full pipeline) and the side drawer (one client). Both are plain
// links in the address bar (?view=pipeline, ?client=slug), so Back closes them. Esc closes,
// focus stays inside while open, and the page behind doesn't scroll.

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/format";

function useDialog(closeHref: string) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const el = ref.current;
    const before = document.activeElement as HTMLElement | null;
    el?.focus();
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (!el) return;
      // Only the top-most dialog reacts (the drawer sits over the overlay).
      const dialogs = document.querySelectorAll("[data-jl-dialog]");
      if (dialogs[dialogs.length - 1] !== el) return;
      if (e.key === "Escape") {
        e.preventDefault();
        router.push(closeHref, { scroll: false });
      }
      if (e.key === "Tab") {
        const items = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select, input, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = body;
      before?.focus?.();
    };
  }, [closeHref, router]);
  return ref;
}

export function PipelineOverlay({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const ref = useDialog(closeHref);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-md">
      <div ref={ref} data-jl-dialog role="dialog" aria-modal="true" aria-labelledby="pipeline-h" tabIndex={-1} className="jl-sheet-in flex min-h-0 flex-1 flex-col outline-none">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 lg:px-8">
          <h2 id="pipeline-h" className="font-display text-lg font-bold">
            {title}
          </h2>
          <Link href={closeHref} scroll={false} aria-label="Close the full pipeline" className="pressable flex size-11 items-center justify-center rounded-2xl border border-line">
            <X aria-hidden className="size-5" />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-8">{children}</div>
      </div>
    </div>
  );
}

export function ClientDrawer({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const ref = useDialog(closeHref);
  return (
    <div className="fixed inset-0 z-[60]">
      <Link href={closeHref} scroll={false} aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/50" />
      <div
        ref={ref}
        data-jl-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-h"
        tabIndex={-1}
        className={cn(
          "jl-sheet-in jl-drawer-in absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl border border-line bg-bg-raised outline-none",
          "lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[min(560px,100vw)] lg:rounded-none lg:rounded-l-3xl",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id="drawer-h" className="min-w-0 truncate font-display text-lg font-bold">
            {title}
          </h2>
          <Link href={closeHref} scroll={false} aria-label="Close the client" className="pressable flex size-11 shrink-0 items-center justify-center rounded-2xl border border-line">
            <X aria-hidden className="size-5" />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
