"use client";

// Opens the browser's print dialog; choose "Save as PDF" for a PDF (one page per slide).

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-violet-deep px-4 text-sm font-semibold text-white">
      <Printer aria-hidden className="size-4" /> Print / Save as PDF
    </button>
  );
}
