"use client";

// Remembers what you've already looked at, so the coaching glow can stop until
// something new shows up.
//
// - Stored in this browser only (localStorage). Nothing is sent anywhere, and
//   only a short fingerprint is saved, never names or amounts.
// - If storage is blocked (private browsing), everything simply counts as new.
// - The server always renders "seen", so the page loads without a flash; the
//   glow appears right after, in the browser.

import { useCallback, useSyncExternalStore } from "react";

const PREFIX = "atlas.seen.";
const EVENT = "atlas-seen-change";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * isNew = there is something here you haven't looked at since it last changed.
 * markSeen() = you've looked; stop glowing until the items change.
 */
export function useSeen(key: string, signature: string | null): { isNew: boolean; markSeen: () => void } {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => signature, // server: treat as seen
  );
  const markSeen = useCallback(() => {
    if (!signature) return;
    try {
      window.localStorage.setItem(PREFIX + key, signature);
    } catch {
      // storage blocked: nothing to remember
    }
    window.dispatchEvent(new Event(EVENT));
  }, [key, signature]);
  return { isNew: signature !== null && stored !== signature, markSeen };
}
