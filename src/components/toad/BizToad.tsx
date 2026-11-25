"use client";

// BizToad (docs/BIZTOAD_PLAN.md): the toad in the corner. Tapping it opens "Ask BizToad"
// (Phase 2, 0030) for people allowed to ask, otherwise a short note with helpful links.
// All timing and distances come from TOAD_RULES.
//
// - corner (computers): eyes follow a nearby mouse, a small idle move every 1–2 minutes,
//   tucks to the edge when a button is underneath it.
// - bar (phones/tablets): a still face in the top bar. No motion at all.
// Nothing moves with "reduce motion", in calm mode, in a background tab, while typing, or
// while a dialog is open. Tucked away ("hidden"), he sinks into the corner with his eyes
// peeking out (they still follow a nearby mouse) and a tap brings him back.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { CONTROL_SELECTOR, eyesMayFollow, mayMove, nextIdleDelay, pickIdleMove, pupilOffset, TOAD_COOKIE, TOAD_RULES, type IdleMove, type ToadMode } from "@/lib/toad";
import { ToadChat } from "./ToadChat";
import { TOAD_EYES, ToadSvg } from "./ToadSvg";

/** Remember the choice in this browser for a year (a display preference, no personal data). */
export function saveToadMode(mode: ToadMode) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${TOAD_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax${secure}`;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
function busy() {
  const a = document.activeElement;
  const typing = Boolean(a && a.matches("input, textarea, select, [contenteditable=true]"));
  const dialogOpen = Boolean(document.querySelector("dialog[open], [role=dialog][aria-modal=true]"));
  return { typing, dialogOpen };
}

export function BizToad({
  variant,
  initialMode,
  links,
  ask,
  note,
}: {
  variant: "corner" | "bar";
  initialMode: ToadMode;
  /** Screens this person's role can open, shown while asking isn't available. */
  links: { label: string; href: string }[];
  /** Set when this person may ask (the server checks again on every question). */
  ask?: { usedUsd: number | null; capUsd: number } | null;
  /** Why asking isn't available (e.g. the database update hasn't been run). */
  note?: string;
}) {
  const pathname = usePathname();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const svgBoxRef = useRef<HTMLSpanElement>(null);
  const leftPupil = useRef<SVGGElement>(null);
  const rightPupil = useRef<SVGGElement>(null);
  const [mode, setMode] = useState<ToadMode>(initialMode);
  // The Account page's switch saves a new choice and refreshes: follow it.
  const [savedMode, setSavedMode] = useState(initialMode);
  if (savedMode !== initialMode) {
    setSavedMode(initialMode);
    setMode(initialMode);
  }
  const [open, setOpen] = useState(false);
  const [move, setMove] = useState<IdleMove | null>(null);
  const [tucked, setTucked] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [talking, setTalking] = useState(false);
  const corner = variant === "corner";

  const shown = () => (rootRef.current?.getClientRects().length ?? 0) > 0;
  const canMove = useCallback(() => mayMove({ mode, reducedMotion: reducedMotion(), tabHidden: document.hidden, ...busy() }) && shown(), [mode]);
  // Tucked away, his peeking eyes still follow a nearby mouse.
  const canFollow = useCallback(() => eyesMayFollow({ mode, reducedMotion: reducedMotion(), tabHidden: document.hidden, ...busy() }) && shown(), [mode]);

  // Eyes follow the mouse (corner only, mouse/trackpad only). At most one update per frame.
  useEffect(() => {
    if (!corner || mode === "calm" || !finePointer()) return;
    const pupils = [leftPupil, rightPupil];
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const box = svgBoxRef.current?.getBoundingClientRect();
      const still = !box || !canFollow();
      TOAD_EYES.forEach((e, i) => {
        const g = pupils[i]?.current;
        if (!g) return;
        const scale = box ? box.width / 64 : 1;
        const { dx, dy } = still ? { dx: 0, dy: 0 } : pupilOffset({ x: box.left + e.x * scale, y: box.top + e.y * scale }, pointer);
        g.style.transform = `translate(${dx}px, ${dy}px)`;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const onMove = (ev: PointerEvent) => {
      pointer = { x: ev.clientX, y: ev.clientY };
      schedule();
    };
    const onLeave = () => {
      pointer = null;
      schedule();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      if (frame) cancelAnimationFrame(frame);
      pupils.forEach((p) => p.current?.style.removeProperty("transform")); // back to the middle
    };
  }, [corner, mode, canFollow]);

  // One small idle move every 1–2 minutes (corner only).
  useEffect(() => {
    if (!corner || mode !== "on") return;
    let wait: ReturnType<typeof setTimeout>;
    let stop: ReturnType<typeof setTimeout>;
    const plan = () => {
      wait = setTimeout(() => {
        if (canMove()) {
          setMove(pickIdleMove(Math.random()));
          stop = setTimeout(() => setMove(null), TOAD_RULES.moveMs);
        }
        plan();
      }, nextIdleDelay(Math.random()));
    };
    plan();
    return () => {
      clearTimeout(wait);
      clearTimeout(stop);
    };
  }, [corner, mode, canMove]);

  // Never cover a button: if a control is under the toad's spot, tuck into the edge.
  useEffect(() => {
    if (!corner || mode === "hidden") return; // tucked away: already out of the way
    let frame = 0;
    const check = () => {
      frame = 0;
      const root = rootRef.current;
      if (!root || root.getClientRects().length === 0) return;
      const r = root.getBoundingClientRect();
      const points = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + 8, r.top + 8],
        [r.right - 8, r.top + 8],
        [r.left + 8, r.bottom - 8],
        [r.right - 8, r.bottom - 8],
      ];
      const covered = points.some(([x, y]) =>
        document.elementsFromPoint(x!, y!).some((el) => !root.contains(el) && el.closest(CONTROL_SELECTOR) !== null),
      );
      setTucked(covered);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    schedule();
    const later = setTimeout(schedule, 600); // after the new page has drawn
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      clearTimeout(later);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [corner, mode, pathname]);

  // Close the panel on Escape, on a tap outside it, and when the page changes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  const [shownOn, setShownOn] = useState(pathname);
  if (shownOn !== pathname) {
    setShownOn(pathname);
    setOpen(false);
  }

  function choose(next: ToadMode) {
    saveToadMode(next);
    setMode(next);
    if (next === "hidden") setOpen(false);
  }
  const away = mode === "hidden";

  const panel = open && (
    <div
      id={panelId}
      role="dialog"
      aria-label="Ask BizToad"
      className={cn(
        "glass z-50 rounded-3xl border border-line bg-bg-raised/95 p-4 text-sm shadow-[0_20px_50px_-12px_rgb(0_0_0/0.7)] backdrop-blur-xl",
        corner ? cn("absolute bottom-full right-0 mb-3", ask ? "w-96" : "w-80") : "fixed inset-x-3 top-28",
      )}
    >
      <p className="mb-1 font-display text-base font-semibold">{ask ? "Ask BizToad" : "Hi, I\u2019m BizToad."}</p>
      {ask ? (
        <ToadChat usedUsd={ask.usedUsd} capUsd={ask.capUsd} onThinking={setThinking} onTalking={setTalking} />
      ) : (
        <p className="text-muted">{note ?? "Soon you\u2019ll be able to ask me questions about your work right here."} Until then, these might help:</p>
      )}
      {!ask && links.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="pressable flex min-h-11 items-center rounded-2xl border border-line px-3 font-medium hover:bg-white/5">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div role="group" aria-label="BizToad options" className="mt-3 flex gap-2 border-t border-line pt-3">
        {corner && (
          <button
            type="button"
            onClick={() => choose(mode === "calm" ? "on" : "calm")}
            aria-pressed={mode === "calm"}
            className="pressable min-h-11 flex-1 rounded-2xl border border-line px-2 text-[13px] font-medium text-muted hover:text-ink"
          >
            {mode === "calm" ? "Let me move" : "Stay still"}
          </button>
        )}
        <button type="button" onClick={() => choose("hidden")} className="pressable min-h-11 flex-1 rounded-2xl border border-line px-2 text-[13px] font-medium text-muted hover:text-ink">
          Tuck me away
        </button>
      </div>
      <p className="mt-2 text-[11px] text-faint">Tucked away, I wait in the corner: tap me to bring me back. More options on the Account page.</p>
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-toad
      className={cn(
        corner ? "toad-corner fixed bottom-6 right-6 z-30 hidden lg:block" : "relative",
        corner && tucked && !open && !away && "toad-tucked",
        away && (corner ? "toad-away" : "toad-away-bar"),
        move && `toad-move-${move}`,
        thinking && "toad-thinking",
        talking && "toad-talking",
      )}
    >
      {panel}
      <button
        type="button"
        onClick={() => (away ? choose("on") : setOpen((o) => !o))}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!away) setOpen(true);
        }}
        aria-label={away ? "Bring BizToad back" : "Ask BizToad"}
        title={away ? "Bring BizToad back" : undefined}
        aria-expanded={away ? undefined : open}
        aria-controls={open ? panelId : undefined}
        className={cn(
          "toad-button pressable flex items-center justify-center rounded-full",
          corner ? "size-16" : "size-11",
        )}
      >
        <span ref={svgBoxRef} className="flex">
          <ToadSvg size={corner ? 64 : 32} pupilRefs={corner ? [leftPupil, rightPupil] : undefined} />
        </span>
      </button>
    </div>
  );
}
