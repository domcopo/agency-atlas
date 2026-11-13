"use client";

// Trash (0019): "Move to Trash" (owner + managers, one extra tap to confirm) and
// "Delete forever" (owner only, type DELETE). Server actions re-check who you are and the
// database has the final say; these are just the buttons.

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { deleteForever, moveToTrash, restoreFromTrash } from "@/app/actions";
import { DELETE_CONFIRM, deleteConfirmed, type TrashKind } from "@/lib/trash";

const btn = "pressable min-h-11 rounded-xl border border-line bg-white/5 px-4 text-sm font-semibold";

/** A small "Move to Trash…" that asks once before doing it. */
export function MoveToTrashButton({ kind, id, what, note }: { kind: TrashKind; id: string; what: string; note?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-faint hover:text-rose">
        <Trash2 aria-hidden className="size-3.5" /> Move to Trash…
      </button>
    );
  }
  return (
    <form action={moveToTrash} className="glass space-y-2 rounded-2xl border border-rose/30 p-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">
        Move <span className="font-semibold">{what}</span> to Trash? It disappears from every list, and the owner or a manager can restore it from Trash.
      </p>
      {note && <p className="text-xs text-muted">{note}</p>}
      <div className="flex gap-2">
        <button type="submit" className="pressable min-h-11 rounded-xl bg-rose/80 px-4 text-sm font-semibold text-white">
          Move to Trash
        </button>
        <button type="button" onClick={() => setAsking(false)} className={btn}>
          Keep it
        </button>
      </div>
    </form>
  );
}

export function RestoreButton({ kind, id }: { kind: TrashKind; id: string }) {
  return (
    <form action={restoreFromTrash}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={btn}>
        Restore
      </button>
    </form>
  );
}

/** Owner only. Type DELETE, then the button turns on. */
export function DeleteForeverForm({ kind, id, what }: { kind: TrashKind; id: string; what: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState(deleteForever, undefined);
  if (state?.ok) return <p role="status" className="text-xs text-lime">Deleted forever.</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="pressable min-h-11 rounded-xl px-3 text-sm font-semibold text-rose">
        Delete forever…
      </button>
    );
  }
  return (
    <form action={action} className="w-full space-y-2 rounded-2xl border border-rose/40 bg-rose/5 p-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">
        This permanently deletes <span className="font-semibold">{what}</span>
        {kind === "client" ? " and everything attached to it (work orders, check-ins, timeline, comments, history)" : " with its comments and history"}. It can&apos;t be undone in Atlas.
      </p>
      <label className="block text-xs text-muted">
        Type <span className="font-mono font-semibold text-ink">{DELETE_CONFIRM}</span> to confirm
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink"
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-xs text-rose">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={!deleteConfirmed(typed) || pending} className="pressable min-h-11 rounded-xl bg-rose px-4 text-sm font-semibold text-white disabled:opacity-40">
          {pending ? "Deleting…" : "Delete forever"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btn}>
          Cancel
        </button>
      </div>
    </form>
  );
}
