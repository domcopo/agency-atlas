// A section that folds away: a tappable row with a title, a one-line summary and
// a small arrow. Tap to open. Plain HTML <details>, so it works without extra JavaScript.

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function Fold({
  title,
  summary,
  badge,
  children,
  defaultOpen = false,
  label,
}: {
  title: string;
  /** One short line shown while closed (and open). */
  summary?: ReactNode;
  /** Small count on the right, e.g. "5 overdue". */
  badge?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  label: string;
}) {
  return (
    <details className="group mt-5" open={defaultOpen} aria-label={label}>
      <summary className="pressable glass flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-3xl px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</span>
          {summary && <span className="mt-0.5 line-clamp-1 text-sm">{summary}</span>}
        </span>
        {badge && <span className="shrink-0 text-xs text-faint">{badge}</span>}
        <ChevronDown aria-hidden className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="mt-2.5">{children}</div>
    </details>
  );
}
