// Side-by-side columns on wide screens only. On phones and tablets (under 1024 px) this
// is a plain box, so sections stack in exactly the order they're written: the phone
// layout never changes. Put each column's sections inside a <Column>.

import type { ReactNode } from "react";
import { cn } from "@/lib/format";

const layouts = {
  /** Two equal columns. */
  halves: "lg:grid-cols-2",
  /** A wider main column and a narrower side column. */
  main: "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]",
  /** Two columns at 1024 px, three from 1280 px. */
  thirds: "lg:grid-cols-2 xl:grid-cols-3",
} as const;

/** `single` keeps one column on every screen (e.g. when the left column would be empty). */
export function Columns({ children, layout = "halves", className, single = false }: { children: ReactNode; layout?: keyof typeof layouts; className?: string; single?: boolean }) {
  if (single) return <div className={className}>{children}</div>;
  return <div className={cn("atlas-cols lg:grid lg:items-start lg:gap-x-8 xl:gap-x-10", layouts[layout], className)}>{children}</div>;
}

/** One column. */
export function Column({ children, className }: { children: ReactNode; className?: string }) {
  // Side by side, the first section in each column drops its top gap so the columns start level.
  return <div className={cn("min-w-0 lg:[.atlas-cols>&>:first-child]:mt-0", className)}>{children}</div>;
}

/**
 * For a list of cards: stacked with a small gap on phones (as before), a grid of
 * 2 across from 1024 px and 3 across from 1280 px.
 */
export const CARD_GRID = "space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 xl:grid-cols-3";
/** Same, but at most 2 across (for wider cards). */
export const CARD_GRID_2 = "space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0";
