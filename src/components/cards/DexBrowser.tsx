"use client";

// Search and filter for the Business Dex. All filtering happens on the fake
// data already on the page. (Later, with real data, the server decides what a
// user may see — the browser only narrows down what it was allowed to receive.)

import { SearchX, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/format";
import type { Business } from "@/lib/types";
import { EmptyState } from "@/components/labels/labels";
import { DexCard } from "./DexCard";

type Segment = "all" | "clients" | "prospects";

const segments: { id: Segment; label: string }[] = [
  { id: "all", label: "All" },
  { id: "clients", label: "Sample clients" },
  { id: "prospects", label: "Others" },
];

export function DexBrowser({
  businesses,
  patterns,
}: {
  businesses: Business[];
  patterns: { tag: string; businessIds: string[] }[];
}) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [tag, setTag] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return businesses.filter((b) => {
      if (segment === "clients" && !b.isClient) return false;
      if (segment === "prospects" && b.isClient) return false;
      if (tag && !b.patternTags.includes(tag)) return false;
      if (!q) return true;
      return [b.name, b.industry, b.tagline, b.region, ...b.patternTags, ...b.acquisitionChannels]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [businesses, query, segment, tag]);

  return (
    <div>
      <label className="glass flex min-h-12 items-center gap-2 rounded-2xl px-3.5">
        <Search aria-hidden className="size-4 text-muted" />
        <span className="sr-only">Search the Business Dex</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, industry, channel…"
          maxLength={80}
          autoComplete="off"
          className="w-full bg-transparent py-3 text-[16px] text-ink placeholder:text-faint focus:outline-none"
        />
      </label>

      <div role="group" aria-label="Filter by relationship" className="mt-3 flex gap-1.5">
        {segments.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSegment(s.id)}
            aria-pressed={segment === s.id}
            className={cn(
              "pressable min-h-9 rounded-full border px-3.5 text-xs font-semibold",
              segment === s.id
                ? "border-violet/60 bg-violet/20 text-ink"
                : "border-line bg-white/5 text-muted hover:text-ink",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <section aria-labelledby="patterns-heading" className="mt-6">
        <h2
          id="patterns-heading"
          className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted"
        >
          Patterns across businesses
        </h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {patterns.map((p) => {
            const active = tag === p.tag;
            return (
              <button
                key={p.tag}
                type="button"
                onClick={() => setTag(active ? null : p.tag)}
                aria-pressed={active}
                className={cn(
                  "pressable flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
                  active
                    ? "border-teal/60 bg-teal/15 text-teal"
                    : "border-line bg-white/5 text-muted hover:text-ink",
                )}
              >
                {p.tag}
                <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-ink">
                  {p.businessIds.length}
                </span>
                {active && <X aria-hidden className="size-3" />}
              </button>
            );
          })}
        </div>
      </section>

      <p className="mb-2.5 mt-6 px-1 text-xs text-faint" aria-live="polite">
        {results.length} of {businesses.length} businesses
      </p>

      {results.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3">
          {results.map((b, i) => (
            <li key={b.id} className="animate-rise-in" style={{ animationDelay: `${i * 30}ms` }}>
              <DexCard business={b} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<SearchX className="size-5" />} title="No matches">
          Try a different word, or clear the filters.
        </EmptyState>
      )}
    </div>
  );
}
