// SEO Watcher: small shared pieces (sample banner, section links, "ask for more room").

import { CircleAlert, FlaskConical } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/format";
import type { RoomNotice } from "@/lib/watch/compute";

export const WATCH_BASE = "/growth/watcher/preview";

/** Always on top of every preview screen: this is fictional. */
export function SampleNotice() {
  return (
    <div role="note" className="mb-4 flex items-start gap-2 rounded-2xl border border-amber/50 bg-banner-amber px-3.5 py-2.5 text-xs text-amber lg:text-sm">
      <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>
        <span className="font-semibold">Sample (fictional).</span> Made-up businesses in real US cities, made-up rankings and search volumes. Nothing
        was fetched and nothing cost money. Real watching starts after database update 0027 (Phase B).
      </p>
    </div>
  );
}

const LINKS = [
  { href: WATCH_BASE, label: "Board" },
  { href: `${WATCH_BASE}/demand`, label: "Search demand" },
  { href: `${WATCH_BASE}/opportunities`, label: "Opportunities" },
] as const;

export function WatchTabs({ active }: { active: (typeof LINKS)[number]["label"] }) {
  return (
    <nav aria-label="SEO Watcher sections" className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.label === active ? "page" : undefined}
          className={cn(
            "pressable inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm",
            l.label === active ? "border-violet/60 bg-violet/15 font-semibold text-violet" : "border-line text-muted",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** "Running low on room" notice. The app asks; it never raises a cap or limit itself. */
export function RoomLine({ notice }: { notice: RoomNotice }) {
  const tone = notice.level === "ok" ? "text-muted" : notice.level === "ask" ? "text-amber" : "text-rose";
  return (
    <p className={cn("flex items-start gap-1.5 text-xs", tone)}>
      {notice.level !== "ok" && <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
      <span>{notice.text}</span>
    </p>
  );
}

/** "model" / "inferred" label next to a number. */
export function Basis({ children }: { children: string }) {
  return <span className="rounded-full border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-faint">{children}</span>;
}
