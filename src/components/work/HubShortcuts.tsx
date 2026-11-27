"use client";

// Work hub keyboard shortcuts (docs/WORK_HUB_PLAN.md Phase 5), for computers:
//   N  new (opens Smart add)     /  search      J / K  next / previous item
//   Enter  open the item (the focused title is a plain link)     X  mark the item done
//   Z  undo the last done or move (UndoToast.tsx)     ?  this list (the "Shortcuts" button)
// Keys are ignored while you type in a box, while a pop-up is open, or with Cmd/Ctrl/Alt
// held. X only acts on the item that has keyboard focus (picked with J/K or Tab), and it
// presses that row's own Done box, so it goes through the same server action and checks.

import { useEffect } from "react";
import { HubDialog, openHubDialog } from "@/components/work/HubDialog";

const ROW = "[data-hub-row]";

function visibleRows(): HTMLElement[] {
  // Rows inside a folded group have no size, so they're skipped.
  return Array.from(document.querySelectorAll<HTMLElement>(ROW)).filter((el) => el.getClientRects().length > 0);
}

function focusRow(row: HTMLElement | undefined) {
  if (!row) return;
  const link = row.querySelector<HTMLElement>("[data-row-open]");
  (link ?? row).focus();
  row.scrollIntoView({ block: "nearest" });
}

function typing(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function HubShortcuts({ canAdd }: { canAdd: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (typing(e.target) || document.querySelector("dialog[open]")) return;
      const key = e.key.toLowerCase();
      const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(ROW) ?? null;

      if (e.key === "?") {
        e.preventDefault();
        openHubDialog("keys");
      } else if (e.key === "/") {
        const search = document.getElementById("work-search") as HTMLInputElement | null;
        if (!search) return;
        e.preventDefault();
        search.focus();
        search.select();
      } else if (key === "n" && canAdd) {
        e.preventDefault();
        openHubDialog("new");
      } else if (key === "j" || key === "k") {
        const rows = visibleRows();
        if (!rows.length) return;
        e.preventDefault();
        const at = current ? rows.indexOf(current) : -1;
        const next = at === -1 ? (key === "j" ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + (key === "j" ? 1 : -1)));
        focusRow(rows[next]);
      } else if (key === "x" && current) {
        const done = current.querySelector<HTMLButtonElement>("[data-row-done]");
        if (!done || done.disabled) return;
        e.preventDefault();
        const rows = visibleRows();
        const at = rows.indexOf(current);
        done.click();
        // Keep your place: focus moves to the next item while this one is saved.
        focusRow(rows[at + 1] ?? rows[at - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAdd]);
  return null;
}

/** The one-line key guide under the list (computers only). */
export function ShortcutHint({ canAdd, done = true }: { canAdd: boolean; done?: boolean }) {
  const keys: [string, string][] = [
    ...(canAdd ? ([["N", "new"]] as [string, string][]) : []),
    ["/", "search"],
    ["J / K", "move"],
    ["Enter", "open"],
    ...(done && canAdd ? ([["X", "mark done"]] as [string, string][]) : []),
    ...(canAdd ? ([["Z", "undo"]] as [string, string][]) : []),
    ["?", "all keys"],
  ];
  return (
    <p className="hidden flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted lg:flex" aria-label="Keyboard shortcuts">
      {keys.map(([k, what]) => (
        <span key={k}>
          <kbd className="rounded-md border border-line bg-white/5 px-1 font-sans text-[11px] font-semibold text-ink">{k}</kbd> {what}
        </span>
      ))}
    </p>
  );
}

const KEYS: { k: string; what: string; lead?: boolean }[] = [
  { k: "N", what: "New work (opens Smart add)", lead: true },
  { k: "/", what: "Jump to search" },
  { k: "J", what: "Next item" },
  { k: "K", what: "Previous item" },
  { k: "Enter", what: "Open the item beside the list" },
  { k: "Esc", what: "Close the item or pop-up" },
  { k: "X", what: "Mark the item done (list only)", lead: true },
  { k: "Z", what: "Undo the last done or board move (while the Undo bar shows)", lead: true },
  { k: "Cmd/Ctrl + K", what: "Smart add from anywhere on Work", lead: true },
  { k: "?", what: "Show this list" },
];

/** The "Shortcuts" pop-up (header button, or press ?). */
export function ShortcutsPopup({ canAdd, defaultOpen }: { canAdd: boolean; defaultOpen?: boolean }) {
  return (
    <HubDialog name="keys" title="Keyboard shortcuts" subtitle="On a computer. They don't work while you're typing in a box." defaultOpen={defaultOpen}>
      <dl className="divide-y divide-line">
        {KEYS.filter((r) => canAdd || !r.lead).map((r) => (
          <div key={r.k} className="flex items-center gap-4 py-2">
            <dt className="w-28 shrink-0">
              <kbd className="rounded-md border border-line bg-white/5 px-2 py-0.5 font-sans text-xs font-semibold text-ink">{r.k}</kbd>
            </dt>
            <dd className="text-sm text-muted">{r.what}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-muted">X and Z save straight away, like tapping the Done box or Undo. Pick an item with J or K first; X never acts on an item you haven&apos;t picked.</p>
    </HubDialog>
  );
}
