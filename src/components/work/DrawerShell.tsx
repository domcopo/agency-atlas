"use client";

// The Work hub drawer's frame: a panel on the right (full screen on a phone). The list
// stays visible beside it on a computer. Esc or × closes it (back to the same address
// without ?open=). Only opening, closing and focus happen here; the content is server-made.

import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

export function DrawerShell({ id, title, closeHref, fullHref, children }: { id: string; title: string; closeHref: string; fullHref?: string; children: ReactNode }) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus into the drawer when a new item opens (screen readers and keyboards land here).
  useEffect(() => {
    heading.current?.focus();
  }, [id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Leave Esc alone while a menu or a text box inside the page is using it.
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[aria-expanded='true']")) return;
      // A pop-up (Smart add, Suggestions) on top takes Esc for itself.
      if (document.querySelector("dialog[open]")) return;
      router.push(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [closeHref, router]);

  return (
    <aside
      aria-labelledby={`drawer-title-${id}`}
      className="fixed inset-0 z-[60] flex flex-col border-line bg-panel shadow-2xl shadow-black/50 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[34rem] lg:border-l"
    >
      <div className="flex items-start gap-2 border-b border-line px-4 py-3">
        <h2 id={`drawer-title-${id}`} ref={heading} tabIndex={-1} className="min-w-0 flex-1 pt-2 font-display text-lg font-bold leading-snug outline-none">
          {title}
        </h2>
        {fullHref && (
          <Link href={fullHref} className="pressable inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-white/[0.06] hover:text-ink">
            Full page <ExternalLink aria-hidden className="size-3.5" />
          </Link>
        )}
        <Link href={closeHref} scroll={false} aria-label="Close" className="pressable flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-white/[0.06] hover:text-ink">
          <X aria-hidden className="size-5" />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-3">{children}</div>
    </aside>
  );
}
