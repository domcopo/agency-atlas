// Mission Control's top numbers: six tiles, each says where its number comes from
// and links to the screen that explains it. "–" means the source isn't connected or synced.

import Link from "next/link";
import { cn } from "@/lib/format";

export interface PulseTile {
  label: string;
  value: string;
  /** Short source note, e.g. "Plans · not payments". */
  source: string;
  href: string;
  tone?: "teal" | "lime" | "amber" | "rose" | "violet" | "plain";
}

const toneText = {
  teal: "text-teal",
  lime: "text-lime",
  amber: "text-amber",
  rose: "text-rose",
  violet: "text-violet",
  plain: "text-ink",
} as const;

export function PulseStrip({ tiles }: { tiles: PulseTile[] }) {
  return (
    <section aria-label="Agency at a glance" className="mb-3 grid grid-cols-3 gap-2 lg:grid-cols-6">
      {tiles.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className="pressable glass flex min-h-[76px] flex-col justify-between rounded-2xl px-2.5 py-2 hover:bg-white/[0.05]"
        >
          <span className="text-[11px] leading-tight text-muted">{t.label}</span>
          <span className={cn("font-display text-lg font-bold leading-tight", toneText[t.tone ?? "plain"])}>{t.value}</span>
          <span className="truncate text-[10px] leading-tight text-faint">{t.source}</span>
        </Link>
      ))}
    </section>
  );
}
