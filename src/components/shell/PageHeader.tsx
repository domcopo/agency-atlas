import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows a back link when set. */
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
  /** Small chip on the subtitle line (e.g. today's goal on Clients). */
  badge?: ReactNode;
}

export function PageHeader({ title, subtitle, backHref, backLabel, action, badge }: PageHeaderProps) {
  return (
    <header className="mb-5 pt-4 lg:mb-6 lg:pt-8">
      {backHref && (
        <Link
          href={backHref}
          className="pressable -ml-1 mb-2 inline-flex min-h-11 items-center gap-0.5 pr-2 text-sm text-violet"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {backLabel ?? "Back"}
        </Link>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight lg:text-[38px]">
            {title}
          </h1>
          {badge ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
              {badge}
            </div>
          ) : (
            subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 flex items-baseline justify-between px-1 lg:mb-3 lg:mt-8">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted lg:text-sm">
        {children}
      </h2>
      {aside && <span className="text-xs text-faint">{aside}</span>}
    </div>
  );
}
