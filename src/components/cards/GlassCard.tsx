import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";

const paddings = { normal: "p-4", tight: "p-3.5", none: "p-0" } as const;

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  /** Inner spacing. Set here (not in className) so styles never conflict. */
  padding?: keyof typeof paddings;
  /** When set, the whole card becomes a link with press + shimmer feedback. */
  href?: string;
  /** Accessible name for linked cards. */
  label?: string;
}

/** The base surface for every card in the app. */
export function GlassCard({ children, className, padding = "normal", href, label }: GlassCardProps) {
  const classes = cn("glass block rounded-3xl", paddings[padding], className);
  if (href) {
    return (
      <Link href={href} aria-label={label} className={cn(classes, "shimmer pressable")}>
        {children}
      </Link>
    );
  }
  return <div className={classes}>{children}</div>;
}
