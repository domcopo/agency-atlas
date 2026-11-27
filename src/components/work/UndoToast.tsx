"use client";

// Work hub Undo (docs/WORK_HUB_PLAN.md, after Phase 5). After you mark an item done (the
// Done box or X) or move a board card, a small bar says what changed and offers Undo for
// 10 seconds (or press Z). Undo is an ordinary status change back to what it was, through
// the same server action (updateAction), so the same checks run and the item's history
// shows both steps. Nothing is deleted or hidden.

import { Check, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { updateAction } from "@/app/actions";
import { cn } from "@/lib/format";

const CHANGE_EVENT = "atlas:work-changed";
const SHOW_MS = 10_000;

export interface WorkChange {
  id: string;
  /** "Marked done: Fix the page title" */
  message: string;
  /** How it was before, to put back on Undo. */
  before: { status: string; reason?: string | null };
}

export function announceChange(change: WorkChange) {
  window.dispatchEvent(new CustomEvent<WorkChange>(CHANGE_EVENT, { detail: change }));
}

function setStatus(id: string, status: string, reason?: string | null) {
  const fd = new FormData();
  fd.set("actionId", id);
  fd.set("op", "status");
  fd.set("status", status);
  if (reason) fd.set("reason", reason);
  return updateAction(fd);
}

function typing(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function UndoToast() {
  const [change, setChange] = useState<WorkChange | null>(null);
  const [state, setState] = useState<"shown" | "undoing" | "undone">("shown");
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideLater = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setChange(null), ms);
  }, []);

  useEffect(() => {
    const on = (e: Event) => {
      setChange((e as CustomEvent<WorkChange>).detail);
      setState("shown");
      hideLater(SHOW_MS);
    };
    window.addEventListener(CHANGE_EVENT, on);
    return () => {
      window.removeEventListener(CHANGE_EVENT, on);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [hideLater]);

  const undo = useCallback(() => {
    if (!change || state !== "shown") return;
    setState("undoing");
    startTransition(async () => {
      await setStatus(change.id, change.before.status, change.before.reason);
      setState("undone");
      hideLater(2500);
    });
  }, [change, state, hideLater]);

  // Z undoes the last change while the bar is showing (not while typing or in a pop-up).
  useEffect(() => {
    if (!change || state !== "shown") return;
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.key.toLowerCase() !== "z") return;
      if (typing(e.target) || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [change, state, undo]);

  if (!change) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-line bg-panel px-4 py-2 shadow-2xl shadow-black/40 lg:bottom-8">
      {state === "undone" ? (
        <p className="flex min-h-10 flex-1 items-center gap-2 text-sm">
          <Check aria-hidden className="size-4 text-lime" /> Undone. It&apos;s back how it was.
        </p>
      ) : (
        <>
          <p className="min-w-0 flex-1 truncate text-sm">{change.message}</p>
          <button
            type="button"
            onClick={undo}
            disabled={state === "undoing"}
            className={cn("pressable inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-violet/50 bg-violet/20 px-3 text-sm font-semibold text-ink hover:bg-violet/30 disabled:opacity-60")}
          >
            <RotateCcw aria-hidden className="size-4" /> {state === "undoing" ? "Undoing…" : "Undo"}
            <kbd className="hidden rounded-md border border-line px-1 font-sans text-[11px] text-muted lg:inline">Z</kbd>
          </button>
        </>
      )}
      <button type="button" onClick={() => setChange(null)} aria-label="Close" className="pressable flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:text-ink">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

/** The Done box on a Work list row: one tap marks it done (or approves it, if in review), then offers Undo. */
export function DoneBox({ id, title, status, reason }: { id: string; title: string; status: string; reason: string | null }) {
  const [pending, startTransition] = useTransition();
  const review = status === "review";
  const label = review ? "Approve as done" : "Mark done";
  const press = () =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("actionId", id);
      fd.set("op", review ? "approve" : "done");
      await updateAction(fd);
      announceChange({ id, message: `${review ? "Approved" : "Marked done"}: ${title}`, before: { status, reason } });
    });
  return (
    <span className="flex justify-center">
      <button
        type="button"
        data-row-done
        onClick={press}
        disabled={pending}
        title={label}
        aria-label={`${label}: ${title}`}
        className="pressable group/done flex size-10 items-center justify-center rounded-xl disabled:opacity-60 @3xl:size-9"
      >
        <span className={cn("flex size-5 items-center justify-center rounded-md border-2 group-hover/done:border-lime", pending ? "border-lime" : "border-faint")}>
          <Check aria-hidden className={cn("size-3.5 text-lime group-hover/done:opacity-100", pending ? "opacity-100" : "opacity-0")} />
        </span>
      </button>
    </span>
  );
}
