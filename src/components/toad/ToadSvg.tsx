// BizToad, drawn by hand as SVG (docs/BIZTOAD_PLAN.md). Each part is its own layer so it
// can move: pupils (follow the mouse), eyelids (blink), bow tie (wiggle). The drawing is
// decorative: the button around it carries the label for screen readers.
//
// Drawing units match pixels at the normal 64 px size, so a pupil offset of 4 = 4 px.

import type { Ref } from "react";

export const TOAD_EYES = [
  { x: 20, y: 20 },
  { x: 44, y: 20 },
] as const;

const SKIN = "#5fbf4a";
const SKIN_DARK = "#2f7d2c";
const BELLY = "#9be07f";
const INK = "#101010";

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
        {/* Eye bumps, then the head over them. */}
        {TOAD_EYES.map((e) => (
          <circle key={`bump-${e.x}`} cx={e.x} cy={e.y} r={11} fill={SKIN} stroke={SKIN_DARK} strokeWidth={1.5} />
        ))}
        <ellipse cx={32} cy={37} rx={27} ry={19} fill={SKIN} stroke={SKIN_DARK} strokeWidth={1.5} />
        <ellipse cx={32} cy={44} rx={17} ry={9} fill={BELLY} opacity={0.55} />
        {/* Cover the head outline where it crosses the eye bumps. */}
        {TOAD_EYES.map((e) => (
          <circle key={`fill-${e.x}`} cx={e.x} cy={e.y + 1} r={9.6} fill={SKIN} />
        ))}

        {/* Eyes: white, then a moving pupil, then an eyelid that closes for a blink. */}
        {TOAD_EYES.map((e, i) => (
          <g key={`eye-${e.x}`}>
            <circle cx={e.x} cy={e.y} r={8} fill="#fffdf2" stroke={SKIN_DARK} strokeWidth={1} />
            <g className="toad-glance">
              <g ref={pupilRefs?.[i]} className="toad-pupil">
                <circle cx={e.x} cy={e.y} r={4.2} fill={INK} />
                <circle cx={e.x - 1.4} cy={e.y - 1.5} r={1.3} fill="#fff" />
              </g>
            </g>
            <ellipse className="toad-lid" cx={e.x} cy={e.y} rx={8.6} ry={8.6} fill={SKIN} stroke={SKIN_DARK} strokeWidth={1} />
          </g>
        ))}

        {/* Nostrils, cheeks, smile. */}
        <circle cx={28.5} cy={33} r={1} fill={SKIN_DARK} />
        <circle cx={35.5} cy={33} r={1} fill={SKIN_DARK} />
        <circle cx={14} cy={40} r={3.2} fill="#ff9aa8" opacity={0.45} />
        <circle cx={50} cy={40} r={3.2} fill="#ff9aa8" opacity={0.45} />
        <path d="M19 39 Q32 49 45 39" fill="none" stroke={SKIN_DARK} strokeWidth={2} strokeLinecap="round" />

        {/* Black bow tie, with a faint light edge so it shows on the dark theme. */}
        <g className="toad-tie">
          <path d="M32 55.5 L20.5 50 L20.5 61 Z" fill={INK} stroke="#f5f3ff" strokeOpacity={0.4} strokeWidth={0.8} strokeLinejoin="round" />
          <path d="M32 55.5 L43.5 50 L43.5 61 Z" fill={INK} stroke="#f5f3ff" strokeOpacity={0.4} strokeWidth={0.8} strokeLinejoin="round" />
          <rect x={29} y={52.5} width={6} height={6} rx={1.6} fill="#262626" stroke="#f5f3ff" strokeOpacity={0.4} strokeWidth={0.8} />
        </g>
      </g>
    </svg>
  );
}
