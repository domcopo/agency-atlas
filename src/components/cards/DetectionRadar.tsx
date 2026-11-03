"use client";

// "Client detection" radar. A sweep line circles the screen and blips light up as
// it passes. Each blip is one detection:
//   red = problem, amber = needs attention / work orders, green = opportunity / upsell.
// Distance from the center = how close or urgent (center = now).
// Blip size and brightness = how confident the rule is.
//
// It starts as a small card. Tap it to open the full radar, where each blip can
// be tapped for details. It glows slowly when there's something new worth checking.
//
// Detections are worked out on the server (data-source.ts) and passed in. This
// file only draws them. It never fetches or changes data. "Reduce Motion" on the
// phone turns the sweep and glow animation off (globals.css).

import { ChevronDown, ChevronRight, Radar } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/format";
import type { Detection, DetectionKind } from "@/lib/types";
import { useSeen } from "@/lib/use-seen";

const SWEEP_SECONDS = 4;

export const kindStyle: Record<DetectionKind, { label: string; dot: string; text: string; glow: string }> = {
  problem: { label: "Problems", dot: "bg-rose", text: "text-rose", glow: "shadow-[0_0_10px_2px_rgb(255_122_147/0.7)]" },
  attention: { label: "Attention", dot: "bg-amber", text: "text-amber", glow: "shadow-[0_0_10px_2px_rgb(251_191_74/0.7)]" },
  opportunity: { label: "Upsells", dot: "bg-lime", text: "text-lime", glow: "shadow-[0_0_10px_2px_rgb(212_245_122/0.7)]" },
};

// Each kind gets its own third of the circle, so colors don't get mixed up.
const sector: Record<DetectionKind, number> = { problem: 0, attention: 120, opportunity: 240 };

function place(items: Detection[]) {
  const byKind: Record<DetectionKind, Detection[]> = { problem: [], attention: [], opportunity: [] };
  for (const d of items) byKind[d.kind].push(d);
  return items.map((d) => {
    const group = byKind[d.kind];
    const i = group.indexOf(d);
    const angle = sector[d.kind] + 12 + ((i + 0.5) * 96) / group.length; // degrees, clockwise from top
    // 0 = center, 1 = edge. A small stagger keeps same-distance blips from lining up.
    const r = Math.min(0.94, Math.max(0.12, 0.14 + (1 - d.closeness) * 0.74 + ((i % 3) - 1) * 0.07));
    const rad = (angle * Math.PI) / 180;
    return { d, angle, left: 50 + Math.sin(rad) * r * 50, top: 50 - Math.cos(rad) * r * 50 };
  });
}

function closenessWord(c: number) {
  return c >= 0.75 ? "Close" : c >= 0.45 ? "Nearing" : "Far";
}

/** The round scope. `mini` = small, not tappable; full = every blip is a button. */
function Scope({
  items,
  mini,
  selectedId,
  onSelect,
}: {
  items: Detection[];
  mini?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const scale = mini ? 0.45 : 1;
  return (
    <div className={cn("relative aspect-square", mini ? "w-[84px] shrink-0" : "mx-auto w-full max-w-[280px]")}>
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 size-full">
        <circle cx="50" cy="50" r="49" fill="rgb(212 245 122 / 0.03)" stroke="rgb(212 245 122 / 0.28)" strokeWidth={mini ? 1 : 0.4} />
        {[36.5, 24, 11.5].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgb(212 245 122 / 0.14)" strokeWidth={mini ? 0.7 : 0.3} strokeDasharray={mini ? undefined : "1 1.2"} />
        ))}
        <line x1="50" y1="1" x2="50" y2="99" stroke="rgb(212 245 122 / 0.1)" strokeWidth={mini ? 0.7 : 0.3} />
        <line x1="1" y1="50" x2="99" y2="50" stroke="rgb(212 245 122 / 0.1)" strokeWidth={mini ? 0.7 : 0.3} />
        {!mini && (
          <>
            <text x="51.5" y="47" fontSize="2.6" fill="rgb(168 163 192 / 0.8)">now</text>
            <text x="51.5" y="3.6" fontSize="2.6" fill="rgb(168 163 192 / 0.6)">later</text>
          </>
        )}
      </svg>

      <div
        aria-hidden
        className="radar-sweep absolute inset-[1%] rounded-full"
        style={{
          animationDuration: `${SWEEP_SECONDS}s`,
          background: "conic-gradient(from 0deg, transparent 0deg, transparent 290deg, rgb(212 245 122 / 0.28) 360deg)",
        }}
      />
      <span aria-hidden className={cn("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime", mini ? "size-1" : "size-2")} />

      {place(items).map(({ d, angle, left, top }) => {
        const size = (8 + d.confidence * 8) * scale;
        const dot = (
          <span
            className={cn(
              "radar-blip block rounded-full",
              kindStyle[d.kind].dot,
              !mini && kindStyle[d.kind].glow,
              d.id === selectedId && "ring-2 ring-ink ring-offset-2 ring-offset-bg",
            )}
            style={{
              width: size,
              height: size,
              opacity: 0.45 + d.confidence * 0.55,
              animationDuration: `${SWEEP_SECONDS}s`,
              // Light up the moment the sweep passes this angle.
              animationDelay: `${(angle / 360) * SWEEP_SECONDS - SWEEP_SECONDS}s`,
            }}
          />
        );
        const pos = { left: `${left}%`, top: `${top}%` };
        return mini ? (
          <span key={d.id} aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2" style={pos}>
            {dot}
          </span>
        ) : (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelect?.(d.id)}
            aria-pressed={d.id === selectedId}
            aria-label={`${kindStyle[d.kind].label}: ${d.title}. ${closenessWord(d.closeness)}, ${Math.round(d.confidence * 100)}% sure.`}
            className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
            style={pos}
          >
            {dot}
          </button>
        );
      })}
    </div>
  );
}

export function DetectionRadar({
  detections,
  coachSignature,
  limit = 18,
}: {
  detections: Detection[];
  /** Set when something here is worth checking; makes the card glow until opened. */
  coachSignature: string | null;
  limit?: number;
}) {
  const shown = detections.slice(0, limit);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(shown[0]?.id ?? null);
  const selected = shown.find((d) => d.id === selectedId);
  const { isNew, markSeen } = useSeen("radar", coachSignature);
  const counts = (k: DetectionKind) => detections.filter((d) => d.kind === k).length;
  const top = shown[0];

  return (
    <section aria-label="Client detection" className={cn("glass rounded-3xl", isNew && !open && "coach")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          markSeen();
        }}
        className="pressable flex w-full items-center gap-3 p-3 text-left"
      >
        {!open && <Scope items={shown} mini />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Radar aria-hidden className="size-4 text-lime" /> Client detection
            {isNew && !open && <span className="rounded-full bg-amber/20 px-1.5 text-[10px] font-bold text-amber">NEW</span>}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
            {(["problem", "attention", "opportunity"] as const).map((k) => (
              <span key={k} className="flex items-center gap-1">
                <span className={cn("size-1.5 rounded-full", kindStyle[k].dot)} />
                {counts(k)} {kindStyle[k].label.toLowerCase()}
              </span>
            ))}
          </span>
          {!open && top && (
            <span className="mt-1 block truncate text-xs">
              <span className={kindStyle[top.kind].text}>●</span> {top.title}
            </span>
          )}
        </span>
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="animate-rise-in px-3 pb-3">
          <Scope items={shown} selectedId={selectedId} onSelect={setSelectedId} />

          {selected && (
            <Link
              href={selected.href}
              className="pressable mt-3 flex items-center gap-3 rounded-2xl border border-line bg-white/[0.04] p-3"
              aria-live="polite"
            >
              <span className={cn("size-2.5 shrink-0 rounded-full", kindStyle[selected.kind].dot)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{selected.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{selected.why}</span>
                <span className="mt-1 block text-[11px] text-faint">
                  <span className={kindStyle[selected.kind].text}>{closenessWord(selected.closeness)}</span> ·{" "}
                  {Math.round(selected.confidence * 100)}% sure · {selected.isSynthetic ? "Sample data" : "From your client list"}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />
            </Link>
          )}

          <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
            Tap a blip for details. Closer to the center = more urgent; bigger and brighter = more confident. Simple
            rules for now; later an AI can add suggestions for you to review (it can&apos;t act on them).
            {detections.length > shown.length && ` Showing the top ${shown.length} of ${detections.length}.`}
          </p>
        </div>
      )}
    </section>
  );
}
