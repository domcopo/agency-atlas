"use client";

// Work hub pop-ups (Phase 3, docs/WORK_HUB_PLAN.md): Smart add (centered) and Suggestions
// (a panel on the right). Built on the browser's own <dialog>, which keeps keyboard focus
// inside and closes on Esc. The content stays on the page while closed, so a half-typed
// note or an AI outline isn't lost when you close and reopen it.
//
// Ways to open: a button (openHubDialog), the address (?new=1 / ?suggest=1, so older links
// still work), Cmd/Ctrl+K for Smart add, and dropping a file anywhere on the page (Smart add
// gets the file; nothing is sent until you press Organize with AI).

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

export type HubDialogName = "new" | "suggest" | "keys";
const OPEN_EVENT = "atlas:hub-dialog";
/** Smart add listens for this to take dropped files (QuickAddWorkOrders). */
export const SMART_ADD_FILES_EVENT = "atlas:smart-add-files";

export function openHubDialog(name: HubDialogName) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: name }));
}

/** Drops ?new=1 / ?suggest=1 from the address once the pop-up closes (so a reload doesn't reopen it). */
function forgetParam(param: string) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(param)) return;
  url.searchParams.delete(param);
  url.hash = "";
  window.history.replaceState(window.history.state, "", url.pathname + (url.search || ""));
}

export function HubDialog({
  name,
  title,
  subtitle,
  defaultOpen = false,
  side = false,
  shortcut = false,
  fileDrop = false,
  children,
}: {
  name: HubDialogName;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  /** A tall panel on the right instead of a centered window. */
  side?: boolean;
  /** Cmd/Ctrl+K opens it. */
  shortcut?: boolean;
  /** Dropping files anywhere on the page opens it with them. */
  fileDrop?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [dragging, setDragging] = useState(false);
  const param = name;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const open = () => {
      if (!d.open) d.showModal();
    };
    if (defaultOpen) open();
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<HubDialogName>).detail === name) open();
    };
    const onClose = () => forgetParam(param);
    window.addEventListener(OPEN_EVENT, onOpen);
    d.addEventListener("close", onClose);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      d.removeEventListener("close", onClose);
    };
  }, [defaultOpen, name, param]);

  useEffect(() => {
    if (!shortcut) return;
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const d = ref.current;
        if (d && !d.open) d.showModal();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [shortcut]);

  useEffect(() => {
    if (!fileDrop) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(e)) return;
      // Smart add's own box handles drops onto it; everything else lands here.
      if ((e.target as HTMLElement | null)?.closest("[data-smart-add-drop]")) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      const d = ref.current;
      if (d && !d.open) d.showModal();
      window.dispatchEvent(new CustomEvent(SMART_ADD_FILES_EVENT, { detail: files }));
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragover", over);
    document.addEventListener("dragleave", leave);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragover", over);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("drop", drop);
    };
  }, [fileDrop]);

  return (
    <>
      {fileDrop && dragging && (
        <div aria-hidden className="pointer-events-none fixed inset-3 z-[70] flex items-center justify-center rounded-3xl border-2 border-dashed border-violet bg-bg/70 backdrop-blur-sm">
          <p className="rounded-2xl bg-panel px-5 py-3 text-sm font-semibold">Drop pictures or a PDF to start Smart add</p>
        </div>
      )}
      <dialog
        ref={ref}
        aria-labelledby={`dialog-${name}`}
        onClick={(e) => {
          // A click on the dark backdrop (the dialog itself, outside the panel) closes it.
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className={cn(
          "m-0 max-h-none max-w-none border-line bg-panel p-0 text-ink shadow-2xl shadow-black/60 backdrop:bg-black/60 backdrop:backdrop-blur-[2px]",
          side
            ? "fixed inset-y-0 left-auto right-0 h-dvh w-full sm:w-[32rem] sm:border-l"
            : "fixed inset-0 h-dvh w-full sm:inset-auto sm:left-1/2 sm:top-[6vh] sm:h-auto sm:max-h-[88vh] sm:w-[40rem] sm:-translate-x-1/2 sm:rounded-3xl sm:border",
        )}
      >
        <div className={cn("flex flex-col", side ? "h-dvh" : "h-dvh sm:h-auto sm:max-h-[88vh]")}>
          <div className="flex items-start gap-2 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1 pt-1">
              <h2 id={`dialog-${name}`} className="font-display text-lg font-bold leading-snug">
                {title}
              </h2>
              {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
            </div>
            <form method="dialog">
              <button type="submit" aria-label="Close" className="pressable flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-white/[0.06] hover:text-ink">
                <X aria-hidden className="size-5" />
              </button>
            </form>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-3">{children}</div>
        </div>
      </dialog>
    </>
  );
}

/** A link that opens a pop-up (and still works as a plain link before the page's code loads). */
export function OpenDialogLink({ name, href, className, children }: { name: HubDialogName; href: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openHubDialog(name);
      }}
      aria-haspopup="dialog"
      className={className}
    >
      {children}
    </a>
  );
}
