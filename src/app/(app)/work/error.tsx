"use client";

// Work hub (docs/WORK_HUB_PLAN.md Phase 5): shown if the Work page fails to load (for
// example the database didn't answer). Plain words only: the error's own text is never
// shown, since it could carry details. "Try again" reloads just this page.

import { RotateCw, TriangleAlert } from "lucide-react";
import Link from "next/link";

export default function WorkError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = typeof error === "object" && error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <div className="pt-4 lg:pt-6">
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight lg:text-[34px]">Work</h1>
      <div role="alert" className="glass mt-4 max-w-xl rounded-2xl p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <TriangleAlert aria-hidden className="size-4 text-amber" /> Work didn&apos;t load.
        </p>
        <p className="mt-2 text-sm text-muted">Nothing was changed. This is usually a short connection problem; try again in a moment.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => retry()} className="pressable inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-deep px-4 text-sm font-semibold text-white">
            <RotateCw aria-hidden className="size-4" /> Try again
          </button>
          <Link href="/" className="pressable inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-muted hover:text-ink">
            Back to Home
          </Link>
        </div>
        {digest && <p className="mt-4 text-xs text-faint">Reference for the developer: {digest}</p>}
      </div>
    </div>
  );
}
