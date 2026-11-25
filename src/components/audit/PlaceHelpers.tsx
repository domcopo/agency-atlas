"use client";

// Audit builders: Google's place names for the chosen state, as suggestions for the home
// town and a live check under "Other cities" (✓ known, or "did you mean …"). The names come
// from the server one state at a time; saving checks them again on the server.

import { CheckCircle2, CircleAlert } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { getStatePlaces } from "@/app/actions";
import { placeBook, splitPlace } from "@/lib/audit/places";

export function useStatePlaces(initialState: string | undefined) {
  const [state, setState] = useState(initialState ?? "");
  const [names, setNames] = useState<string[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const load = (code: string) => {
    setState(code);
    if (!code || code === loadedFor) return;
    startTransition(async () => {
      const list = await getStatePlaces(code);
      setNames(list);
      setLoadedFor(code);
    });
  };
  // Editing a saved audit: load its state's names once.
  useEffect(() => {
    if (!initialState) return;
    startTransition(async () => {
      const list = await getStatePlaces(initialState);
      setNames(list);
      setLoadedFor(initialState);
    });
  }, [initialState]);
  const book = useMemo(() => (names.length ? placeBook(names) : null), [names]);
  return { state, names, book, load };
}

export function PlaceDatalist({ id, names }: { id: string; names: string[] }) {
  return (
    <datalist id={id}>
      {names.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );
}

/** Under the cities box: each place as Google knows it, or a hint to fix it. */
export function PlaceCheckList({ text, state, book }: { text: string; state: string; book: ReturnType<typeof placeBook> | null }) {
  if (!book || !state || !text.trim()) return null;
  const typed = text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const places = [...new Set(typed.flatMap((t) => splitPlace(t, state)))].slice(0, 20);
  if (!places.length) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Places checked">
      {places.map((p) => {
        const exact = book.canonical(p);
        const hint = exact ? null : book.suggest(p);
        return (
          <li key={p} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${exact ? "border-lime/40 text-lime" : "border-amber/50 text-amber"}`}>
            {exact ? <CheckCircle2 aria-hidden className="size-3.5" /> : <CircleAlert aria-hidden className="size-3.5" />}
            {exact ?? p}
            {!exact && <span className="text-faint">{hint && hint.length ? `: did you mean ${hint.join(", ")}?` : ": not a place Google knows here"}</span>}
          </li>
        );
      })}
    </ul>
  );
}
