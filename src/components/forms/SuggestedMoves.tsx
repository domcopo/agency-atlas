"use client";

// AI helper: "who should I contact first today, and what should I lead with?"
// Suggestions only: nothing is saved or sent, and each run shows its cost.

import Link from "next/link";
import { useActionState } from "react";
import { suggestNextMoves } from "@/app/actions";

export function SuggestedMoves() {
  const [state, action, pending] = useActionState(suggestNextMoves, undefined);
  return (
    <section className="glass rounded-3xl p-3.5" aria-labelledby="moves-h">
      <div className="flex items-center justify-between gap-2">
        <h2 id="moves-h" className="text-sm font-semibold">
          Suggested next moves
        </h2>
        <form action={action}>
          <button type="submit" disabled={pending} className="pressable min-h-10 rounded-xl border border-violet/40 px-3 text-xs font-semibold text-violet disabled:opacity-60">
            {pending ? "Thinking…" : state?.moves ? "Ask again" : "Ask the AI"}
          </button>
        </form>
      </div>
      {state?.error && (
        <p role="alert" className="mt-2 text-xs text-rose">
          {state.error}
        </p>
      )}
      {state?.moves && state.moves.length === 0 && <p className="mt-2 text-sm text-muted">Nothing due in the next two days.</p>}
      {state?.moves && state.moves.length > 0 && (
        <ol className="mt-2 space-y-2">
          {state.moves.map((m) => (
            <li key={m.slug} className="rounded-2xl border border-line px-3 py-2">
              <Link href={`/clients/${m.slug}`} className="text-sm font-semibold hover:underline">
                {m.name}
              </Link>
              <p className="text-xs text-muted">{m.why}</p>
              <p className="text-xs">
                <span className="text-muted">Lead with: </span>
                {m.leadWith}
              </p>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[11px] text-faint">
        {state?.cost ? `Cost ${state.cost}. ` : ""}Uses only what&apos;s logged in Atlas, with names swapped for codes. You decide; nothing is sent.
      </p>
    </section>
  );
}
