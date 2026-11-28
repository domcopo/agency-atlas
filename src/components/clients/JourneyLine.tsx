"use client";

// The Journey Line: one line split into the 6 stages, a tick per touch (27), and a dot per
// client at their next touch (docs/CLIENTS_JOURNEY_LINE_PLAN.md). Colour is never the only
// signal: every state also has an icon and words. Animations stop with "Reduce motion".

import { AlertTriangle, Mail, MessageSquare, Phone, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/format";
import type { DotTiming } from "@/lib/journey-line";
import { dotClasses, STAGE_COLORS, STAGE_TEXT, StateBadge, TIMING_WORDS } from "./dot-style";

export interface LineTickInfo {
  /** Touch number; month marks on the long-term line use 1000 + month. */
  step: number;
  stage: number;
  x: number;
  title: string;
  how: string;
  /** Month marks have no channel, day or deliverable. */
  channel?: "call" | "text" | "email" | "video";
  day?: number;
  deliverable?: string;
  /** A month mark on the long-term line (taller tick). */
  mark?: boolean;
}
export interface LineSegmentInfo {
  stage: number;
  label: string;
  from: number;
  width: number;
  total: number;
  overdue: number;
  today: number;
}
export interface LineDotInfo {
  slug: string;
  name: string;
  initials: string;
  timing: DotTiming;
  reachedOut: boolean;
  dueLabel: string;
}
export interface LineClusterInfo {
  key: string;
  x: number;
  title: string;
  dots: LineDotInfo[];
}

/** Dots shown stacked on one touch before a "+N" bubble. */
const STACK = 3;

const CHANNEL_ICON = { call: Phone, text: MessageSquare, email: Mail, video: Video } as const;
const CHANNEL_WORD = { call: "Call", text: "Text", email: "Email", video: "Video call" } as const;

function stateText(d: LineDotInfo): string {
  return `${TIMING_WORDS[d.timing]}${d.reachedOut ? ", reached out" : ""}`;
}

type Open = { kind: "tick"; step: number } | { kind: "cluster"; key: string } | null;

export function JourneyLine({
  segments,
  ticks,
  clusters,
  pipelineHref,
  clientHref,
  large = false,
}: {
  segments: LineSegmentInfo[];
  ticks: LineTickInfo[];
  clusters: LineClusterInfo[];
  pipelineHref: string;
  /** "/clients?client=" — the client's slug is added. */
  clientHref: string;
  /** The bigger long-term line in the full pipeline. */
  large?: boolean;
}) {
  const stack = large ? 4 : STACK;
  const dotGap = large ? 24 : 15;
  const dotBase = large ? 42 : 30;
  const [open, setOpen] = useState<Open>(null);
  const [pinned, setPinned] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const tickRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);

  // Tap or click outside closes a pinned popover; Esc closes any.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(null);
        setPinned(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setPinned(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hover = (o: Open) => {
    if (!pinned) setOpen(o);
  };
  const leave = () => {
    if (!pinned) setOpen(null);
  };
  const isOpen = (o: Open) => Boolean(open && o && (o.kind === "tick" ? open.kind === "tick" && open.step === o.step : open.kind === "cluster" && open.key === o.key));
  // Focus (keyboard, or the press before a click) shows it; a click pins it; a second click closes.
  const show = (o: Open) => {
    if (isOpen(o)) return;
    setOpen(o);
    setPinned(false);
  };
  const toggle = (o: Open) => {
    if (isOpen(o) && pinned) {
      setOpen(null);
      setPinned(false);
    } else {
      setOpen(o);
      setPinned(true);
    }
  };

  // Ticks are one tab stop; the arrow keys move along the line.
  const onTickKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? ticks.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const n = Math.max(0, Math.min(ticks.length - 1, next));
    setFocusTick(n);
    tickRefs.current[n]?.focus();
    show({ kind: "tick", step: ticks[n]!.step });
  };

  const openTick = open?.kind === "tick" ? ticks.find((t) => t.step === open.step) : undefined;
  const openCluster = open?.kind === "cluster" ? clusters.find((c) => c.key === open.key) : undefined;
  const popX = openTick?.x ?? openCluster?.x ?? 50;

  return (
    <div ref={box} className="relative select-none">
      {/* Count chips, one above each segment. */}
      <div className="relative h-6" aria-hidden>
        {segments.map((s) => (
          <span key={s.stage} className="absolute top-0 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-line bg-bg-raised px-1.5 py-0.5 text-[10px] font-semibold leading-none" style={{ left: `${s.from + s.width / 2}%` }}>
            <span className={cn("size-1.5 rounded-full", STAGE_COLORS[s.stage])} />
            {s.total}
            {s.overdue > 0 && (
              <span className="flex items-center gap-0.5 text-rose">
                <AlertTriangle className="size-2.5" strokeWidth={3} />
                {s.overdue}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* Dots (above the line), the line, and the ticks. */}
      <div className={cn("relative", large ? "h-[150px]" : "h-[86px]")}>
        {/* The coloured line: each segment also opens the full pipeline at that stage. */}
        <div className={cn("absolute inset-x-0 bottom-3", large ? "h-3" : "h-2")}>
          {segments.map((s) => (
            <Link
              key={s.stage}
              href={`${pipelineHref}#stage-${Math.min(s.stage, 5)}`}
              scroll={false}
              tabIndex={-1}
              aria-hidden
              className={cn("absolute inset-y-0 rounded-full opacity-80 transition-opacity hover:opacity-100", STAGE_COLORS[s.stage])}
              style={{ left: `calc(${s.from}% + 1px)`, width: `calc(${s.width}% - 2px)` }}
            />
          ))}
        </div>

        {/* 27 ticks: hover, tap or arrow keys show the touch. */}
        <div role="toolbar" aria-label={large ? "The 27 touches, then months as a client. Use the arrow keys to read each one." : "The 27 touches. Use the arrow keys to read each one."} className="absolute inset-x-0 bottom-0 h-8">
          {ticks.map((t, i) => (
            <button
              key={t.step}
              ref={(el) => {
                tickRefs.current[i] = el;
              }}
              type="button"
              tabIndex={i === focusTick ? 0 : -1}
              aria-label={t.mark || !t.channel ? `${t.title}. ${t.how}.` : `Touch ${t.step}: ${t.title}. ${CHANNEL_WORD[t.channel]}, day ${t.day}. Deliverable: ${t.deliverable}.`}
              aria-expanded={open?.kind === "tick" && open.step === t.step}
              onMouseEnter={() => hover({ kind: "tick", step: t.step })}
              onMouseLeave={leave}
              onFocus={() => {
                setFocusTick(i);
                show({ kind: "tick", step: t.step });
              }}
              onBlur={leave}
              onClick={() => toggle({ kind: "tick", step: t.step })}
              onKeyDown={(e) => onTickKey(e, i)}
              className="group absolute bottom-0 flex h-8 w-3 -translate-x-1/2 items-end justify-center rounded-sm focus-visible:outline-offset-0 sm:w-4"
              style={{ left: `${t.x}%` }}
            >
              <span className={cn("mb-1 block w-[2px] rounded-full bg-ink/45 transition-all group-hover:bg-ink", t.mark ? "h-6 bg-lime/60 group-hover:h-7" : "h-4 group-hover:h-5", open?.kind === "tick" && open.step === t.step && (t.mark ? "h-7 bg-ink" : "h-5 bg-ink"))} />
            </button>
          ))}
        </div>

        {/* Client dots, stacked upward on their touch. Keyed by client so they slide forward. */}
        {clusters.flatMap((cl) => {
          const shown = cl.dots.slice(0, cl.dots.length > stack ? stack - 1 : stack);
          const more = cl.dots.length - shown.length;
          const label = `${cl.title}: ${cl.dots.map((d) => `${d.name} (${stateText(d)})`).join(", ")}`;
          const props = {
            onMouseEnter: () => hover({ kind: "cluster", key: cl.key }),
            onMouseLeave: leave,
            onClick: () => toggle({ kind: "cluster", key: cl.key }),
          };
          const items = shown.map((d, i) => (
            <button
              key={d.slug}
              type="button"
              {...props}
              tabIndex={i === 0 ? 0 : -1}
              aria-label={i === 0 ? label : undefined}
              aria-hidden={i === 0 ? undefined : true}
              aria-expanded={i === 0 ? open?.kind === "cluster" && open.key === cl.key : undefined}
              onFocus={() => show({ kind: "cluster", key: cl.key })}
              className={cn("jl-dot absolute flex -translate-x-1/2 items-center justify-center rounded-full font-bold", large ? "size-8 text-[11px]" : "size-6 text-[9px]", dotClasses(d.timing, d.reachedOut))}
              style={{ left: `${cl.x}%`, bottom: `${dotBase + i * dotGap}px`, zIndex: 10 - i }}
            >
              {d.initials}
              <StateBadge timing={d.timing} reachedOut={d.reachedOut} className="absolute -right-1 -top-1" />
            </button>
          ));
          if (more > 0)
            items.push(
              <button
                key={`more-${cl.key}`}
                type="button"
                {...props}
                tabIndex={-1}
                aria-hidden
                className={cn("jl-dot absolute flex -translate-x-1/2 items-center justify-center rounded-full border-2 border-violet/50 bg-bg-raised px-1 font-bold text-violet", large ? "h-8 min-w-8 text-[11px]" : "h-6 min-w-6 text-[9px]")}
                style={{ left: `${cl.x}%`, bottom: `${dotBase + shown.length * dotGap}px`, zIndex: 1 }}
              >
                +{more}
              </button>,
            );
          return items;
        })}
      </div>

      {/* Stage labels under each segment (the words, so colour isn't the only clue). */}
      <ol className="relative mt-1 h-8" aria-label="Stages">
        {segments.map((s) => (
          <li key={s.stage} className="absolute top-0" style={{ left: `${s.from}%`, width: `${s.width}%` }}>
            <Link
              href={`${pipelineHref}#stage-${Math.min(s.stage, 5)}`}
              scroll={false}
              aria-label={`${s.label}: ${s.total} client${s.total === 1 ? "" : "s"}${s.overdue ? `, ${s.overdue} overdue` : ""}${s.today ? `, ${s.today} due today` : ""}. Open full pipeline.`}
              className="pressable block truncate rounded-lg px-0.5 text-center text-[10px] font-semibold leading-tight text-muted hover:text-ink sm:text-[11px]"
            >
              <span className={cn("mx-auto mb-0.5 block h-0.5 w-4 rounded-full", STAGE_COLORS[s.stage])} aria-hidden />
              {s.label}
            </Link>
          </li>
        ))}
      </ol>

      {/* Popover for a tick or a group of clients. */}
      {(openTick || openCluster) && (
        <div
          role="tooltip"
          className="absolute top-full z-30 mt-1 w-64 max-w-[85vw] rounded-2xl border border-line bg-bg-raised p-3 text-left text-xs shadow-[0_12px_32px_-8px_rgb(0_0_0/0.6)]"
          style={popX > 60 ? { right: `${Math.max(0, 100 - popX - 6)}%` } : { left: `${Math.max(0, popX - 6)}%` }}
          onMouseEnter={() => setPinned(true)}
          onMouseLeave={() => {
            setPinned(false);
            setOpen(null);
          }}
        >
          {openTick && <TickDetails t={openTick} />}
          {openCluster && (
            <>
              <p className="font-semibold">{openCluster.title}</p>
              <ul className="mt-1.5 max-h-56 space-y-1 overflow-y-auto">
                {openCluster.dots.map((d) => (
                  <li key={d.slug}>
                    <Link href={`${clientHref}${encodeURIComponent(d.slug)}`} scroll={false} className="pressable flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/5">
                      <span className={cn("relative flex size-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold", dotClasses(d.timing, d.reachedOut))}>{d.initials}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{d.name}</span>
                        <span className={cn("block truncate text-[11px]", d.timing === "overdue" ? "text-rose" : d.timing === "today" ? "text-amber" : "text-muted")}>
                          {stateText(d)} · {d.dueLabel}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TickDetails({ t }: { t: LineTickInfo }) {
  if (t.mark || !t.channel)
    return (
      <>
        <p className={cn("text-[10px] font-semibold uppercase tracking-wide", STAGE_TEXT[t.stage])}>Grow · long term</p>
        <p className="mt-0.5 text-sm font-semibold">{t.title}</p>
        <p className="mt-1 text-muted">{t.how}</p>
      </>
    );
  const Icon = CHANNEL_ICON[t.channel];
  return (
    <>
      <p className={cn("text-[10px] font-semibold uppercase tracking-wide", STAGE_TEXT[t.stage])}>
        Touch {t.step} · day {t.day}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{t.title}</p>
      <p className="mt-1 flex items-center gap-1.5 text-muted">
        <Icon aria-hidden className="size-3.5" /> {t.how}
      </p>
      <p className="mt-0.5 text-muted">
        <span className="text-faint">Deliverable: </span>
        {t.deliverable}
      </p>
    </>
  );
}

/** Small legend: every state with its icon and words. */
export function JourneyLegend() {
  const items: { timing: DotTiming; reachedOut: boolean; label: string }[] = [
    { timing: "later", reachedOut: false, label: "On track" },
    { timing: "today", reachedOut: false, label: "Due today" },
    { timing: "overdue", reachedOut: false, label: "Overdue" },
    { timing: "later", reachedOut: true, label: "Reached out (GoHighLevel time)" },
  ];
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-faint" aria-label="What the dots mean">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={cn("relative flex size-3.5 items-center justify-center rounded-full !shadow-none [animation:none]", dotClasses(i.timing, false), i.reachedOut && "border-violet ring-2 ring-violet/40")}>
            <StateBadge timing={i.timing} reachedOut={i.reachedOut} className="absolute -right-1.5 -top-1.5 scale-75" />
          </span>
          {i.label}
        </li>
      ))}
    </ul>
  );
}
