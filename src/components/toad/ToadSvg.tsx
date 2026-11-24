// BizToad, drawn by hand as SVG (docs/BIZTOAD_PLAN.md). An original design: a calm,
// slightly realistic frog in muted storybook colors (olive skin, golden eyes with heavy
// lids, a wide flat mouth) wearing a tweedy jacket and a black bow tie.
//
// Each part is its own layer so it can move: pupils (follow the mouse), eyelids (rest
// half-closed, close fully for a blink), bow tie (wiggle). The drawing is decorative: the
// button around it carries the label for screen readers. Drawing units = px at 64 px.

import type { Ref } from "react";

export const TOAD_EYES = [
  { x: 20, y: 19 },
  { x: 44, y: 19 },
] as const;

const SKIN = "#7f9a5b";
const SKIN_SHADE = "#6a8449";
const OUTLINE = "#465c33";
const THROAT = "#b7c690";
const SPOT = "#5c7640";
const IRIS = "#b8913a";
const IRIS_RIM = "#6b5420";
const JACKET = "#8f7148";
const JACKET_DARK = "#6f5636";
const SHIRT = "#ece3cb";
const INK = "#151515";

export function ToadSvg({
  size = 64,
  pupilRefs,
  className,
}: {
  size?: number;
  /** The two pupil layers, moved by BizToad.tsx. */
  pupilRefs?: [Ref<SVGGElement>, Ref<SVGGElement>];
  className?: string;
}) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false" className={className}>
      <g className="toad-body">
        {/* Jacket shoulders and lapels, shirt collar. */}
        <path d="M3 64 C5 53 17 47.5 32 47.5 C47 47.5 59 53 61 64 Z" fill={JACKET} stroke={JACKET_DARK} strokeWidth={1.2} />
        <path d="M25.5 48.2 L32 60 L38.5 48.2 Z" fill={SHIRT} />
        <path d="M25.5 48.2 L32 60 L23 64 L13 64 C15 56 19.5 50.5 25.5 48.2 Z" fill={JACKET_DARK} opacity={0.55} />
        <path d="M38.5 48.2 L32 60 L41 64 L51 64 C49 56 44.5 50.5 38.5 48.2 Z" fill={JACKET_DARK} opacity={0.55} />

        {/* Eye bumps, then the broad head over them. */}
        {TOAD_EYES.map((e) => (
          <circle key={`bump-${e.x}`} cx={e.x} cy={e.y} r={10} fill={SKIN} stroke={OUTLINE} strokeWidth={1.3} />
        ))}
        <ellipse cx={32} cy={33} rx={25.5} ry={15.5} fill={SKIN} stroke={OUTLINE} strokeWidth={1.3} />
        {TOAD_EYES.map((e) => (
          <circle key={`fill-${e.x}`} cx={e.x} cy={e.y + 1.2} r={8.6} fill={SKIN} />
        ))}
        {/* Soft shading under the jaw and a pale throat. */}
        <path d="M9 37 C16 46 48 46 55 37 C50 44 14 44 9 37 Z" fill={SKIN_SHADE} opacity={0.6} />
        <ellipse cx={32} cy={42.5} rx={14} ry={4.2} fill={THROAT} opacity={0.75} />
        {/* A few muted spots. */}
        <circle cx={13} cy={29} r={1.6} fill={SPOT} opacity={0.45} />
        <circle cx={51} cy={30} r={1.9} fill={SPOT} opacity={0.45} />
        <circle cx={47} cy={25} r={1.1} fill={SPOT} opacity={0.4} />
        <circle cx={16.5} cy={24.5} r={1} fill={SPOT} opacity={0.4} />
        <circle cx={32} cy={24} r={1.3} fill={SPOT} opacity={0.35} />

        {/* Eyes: golden iris, a moving horizontal pupil, and a heavy lid that rests half-closed. */}
        {TOAD_EYES.map((e, i) => (
          <g key={`eye-${e.x}`}>
            <circle cx={e.x} cy={e.y} r={7} fill={IRIS} stroke={IRIS_RIM} strokeWidth={1} />
            <g className="toad-glance">
              <g ref={pupilRefs?.[i]} className="toad-pupil">
                <ellipse cx={e.x} cy={e.y + 0.6} rx={3.6} ry={2.1} fill={INK} />
                <circle cx={e.x - 1.6} cy={e.y - 0.3} r={0.9} fill="#fff" opacity={0.85} />
              </g>
            </g>
            <ellipse className="toad-lid" cx={e.x} cy={e.y} rx={7.8} ry={7.8} fill={SKIN} stroke={OUTLINE} strokeWidth={1} />
          </g>
        ))}

        {/* Nostrils and a wide, flat, unbothered mouth. */}
        <circle cx={29} cy={29.5} r={0.8} fill={OUTLINE} />
        <circle cx={35} cy={29.5} r={0.8} fill={OUTLINE} />
        <path d="M9 39 Q11 37.7 15.5 37.6 Q32 38.2 48.5 37.6 Q53 37.7 55 39" fill="none" stroke={OUTLINE} strokeWidth={1.5} strokeLinecap="round" />

        {/* Black bow tie at the collar, with a faint light edge so it shows on the dark theme. */}
        <g className="toad-tie">
          <path d="M32 52.5 L23.5 48.6 L23.5 56.4 Z" fill={INK} stroke="#f5f3ff" strokeOpacity={0.35} strokeWidth={0.7} strokeLinejoin="round" />
          <path d="M32 52.5 L40.5 48.6 L40.5 56.4 Z" fill={INK} stroke="#f5f3ff" strokeOpacity={0.35} strokeWidth={0.7} strokeLinejoin="round" />
          <rect x={29.8} y={50.3} width={4.4} height={4.4} rx={1.2} fill="#262626" stroke="#f5f3ff" strokeOpacity={0.35} strokeWidth={0.7} />
        </g>
      </g>
    </svg>
  );
}
