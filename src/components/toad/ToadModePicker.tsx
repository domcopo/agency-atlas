"use client";

// Account page: show, calm (no moving) or hide BizToad on this device. Saved in a cookie,
// then the page refreshes so the toad appears or disappears at once.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/format";
import type { ToadMode } from "@/lib/toad";
import { saveToadMode } from "./BizToad";

const OPTIONS: { value: ToadMode; label: string }[] = [
  { value: "on", label: "Show" },
  { value: "calm", label: "Stay still" },
  { value: "hidden", label: "Hide" },
];

export function ToadModePicker({ initial }: { initial: ToadMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<ToadMode>(initial);

  return (
    <div role="group" aria-label="BizToad" className="flex gap-1 rounded-2xl border border-line p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={mode === o.value}
          onClick={() => {
            saveToadMode(o.value);
            setMode(o.value);
            router.refresh();
          }}
          className={cn(
            "pressable flex min-h-11 flex-1 items-center justify-center rounded-xl text-[13px] font-medium",
            mode === o.value ? "bg-white/10 text-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
