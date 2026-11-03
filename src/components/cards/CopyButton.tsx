"use client";

// Copies text to this device's clipboard. Nothing is sent anywhere.

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/format";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // Browsers can block copying (e.g. when the page isn't focused).
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={state === "copied" ? "Copied" : state === "failed" ? "Copy blocked by the browser" : label}
      className={cn(
        "pressable inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold",
        state === "copied" && "border-lime/50 bg-lime/15 text-lime",
        state === "failed" && "border-rose/50 bg-rose/15 text-rose",
        state === "idle" && "border-line bg-white/5 text-muted hover:text-ink",
      )}
    >
      {state === "copied" ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
      {state === "copied" ? "Copied" : state === "failed" ? "Blocked" : "Copy"}
    </button>
  );
}
