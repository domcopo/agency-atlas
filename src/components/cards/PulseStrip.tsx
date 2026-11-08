// Mission Control's top numbers: a few tiles, each says where its number comes from
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

function Tile({ t }: { t: PulseTile }) {
  return (
    <Link
      href={t.href}
      className="pressable glass flex min-h-[76px] flex-col justify-between rounded-2xl px-2.5 py-2 hover:bg-white/[0.05]"
    >
      <span className="text-[11px] leading-tight text-muted">{t.label}</span>
      <span className={cn("font-display text-lg font-bold leading-tight", toneText[t.tone ?? "plain"])}>{t.value}</span>
      <span className="truncate text-[10px] leading-tight text-faint">{t.source}</span>
    </Link>
  );
}

/** `hidden` tiles sit behind a "Show …" toggle, closed by default (no script needed). */
export function PulseStrip({ tiles, hidden = [], hiddenLabel = "more" }: { tiles: PulseTile[]; hidden?: PulseTile[]; hiddenLabel?: string }) {
  return (
    <section aria-label="Agency at a glance" className="mb-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <Tile key={t.label} t={t} />
        ))}
      </div>
      {hidden.length > 0 && (
        <details className="group mt-1.5">
          <summary className="pressable inline-flex min-h-9 cursor-pointer list-none items-center px-1 text-xs font-semibold text-violet">
            <span className="group-open:hidden">Show {hiddenLabel}</span>
            <span className="hidden group-open:inline">Hide {hiddenLabel}</span>
          </summary>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {hidden.map((t) => (
              <Tile key={t.label} t={t} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
