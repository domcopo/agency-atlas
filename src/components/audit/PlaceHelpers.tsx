"use client";

// Audit builders: Google's place names for the chosen state (home town suggestions), the
// towns within 30 miles of the home town as one-tap chips (other states too, e.g. "Sharon,
// PA"), and a live check under "Other cities": ✓ Google's spelling and miles from home,
// "far away" past 30 miles, or "did you mean". Everything is worked out on the server from
// public lists (no outside service); saving checks the places again.

import { CheckCircle2, CircleAlert, MapPin, Plus } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { getPlaceHelp, getStatePlaces } from "@/app/actions";
import { NEARBY_MILES, type NearbyTown, type PlaceCheck } from "@/lib/audit/places";

export function useStatePlaces(initialState: string | undefined) {
  const [state, setState] = useState(initialState ?? "");
  const [names, setNames] = useState<string[]>([]);
  const load = (code: string) => {
    setState(code);
    if (!code) return;
    startTransition(async () => setNames(await getStatePlaces(code)));
  };
  // Editing a saved audit: load its state's names once.
  useEffect(() => {
    if (!initialState) return;
    startTransition(async () => setNames(await getStatePlaces(initialState)));
  }, [initialState]);
  return { state, names, load };
}

type Help = { home: string | null; checks: PlaceCheck[]; nearby: NearbyTown[] };

/** Asks the server about the typed places a moment after typing stops. */
export function usePlaceHelp(state: string, home: string, cities: string): Help | null {
  const [help, setHelp] = useState<Help | null>(null);
  useEffect(() => {
    if (!state || !home.trim()) return;
    const t = setTimeout(() => startTransition(async () => setHelp(await getPlaceHelp(state, home, cities))), 400);
    return () => clearTimeout(t);
  }, [state, home, cities]);
  return state && home.trim() ? help : null;
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

/** One-tap chips: towns within 30 miles of the home town that aren't in the list yet. */
export function NearbyChips({ help, onAdd }: { help: Help | null; onAdd: (label: string) => void }) {
  if (!help?.home || !help.nearby.length) return null;
  const have = new Set(help.checks.map((c) => (c.label ?? c.typed).toLowerCase()));
  const offer = help.nearby.filter((n) => !have.has(n.label.toLowerCase())).slice(0, 14);
  if (!offer.length) return null;
  return (
    <div className="mt-2">
      <p className="flex items-center gap-1 text-[11px] text-muted">
        <MapPin aria-hidden className="size-3.5" /> Nearby towns (within {NEARBY_MILES} miles of {help.home}). Tap to add:
      </p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {offer.map((n) => (
          <li key={n.label}>
            <button type="button" onClick={() => onAdd(n.label)} className="pressable inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-2.5 text-[12px]">
              <Plus aria-hidden className="size-3.5 text-violet" /> {n.label} <span className="text-faint">{n.miles} mi</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Under the cities box: each place as Google knows it, its distance, or a hint to fix it. */
export function PlaceCheckList({ help }: { help: Help | null }) {
  if (!help?.checks.length) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Places checked">
      {help.checks.map((c) => {
        const far = c.miles !== null && c.miles > NEARBY_MILES;
        const ok = c.label && !far;
        return (
          <li key={c.typed} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${ok ? "border-lime/40 text-lime" : "border-amber/50 text-amber"}`}>
            {ok ? <CheckCircle2 aria-hidden className="size-3.5" /> : <CircleAlert aria-hidden className="size-3.5" />}
            {c.label ?? c.typed}
            {c.label && c.miles !== null && <span className="text-faint"> · {c.miles} mi</span>}
            {far && <span className="text-faint">: far from {help.home}. Keep it only if they really serve there</span>}
            {!c.label && <span className="text-faint">{c.suggest.length ? `: did you mean ${c.suggest.join(", ")}?` : ": not a place Google knows"}</span>}
          </li>
        );
      })}
    </ul>
  );
}
