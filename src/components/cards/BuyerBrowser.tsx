"use client";

// Search and filter for the Buyers Dex. Filters only the fake data already on the page.

import { SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import type { Buyer, BuyerStrategy } from "@/lib/types";
import { EmptyState } from "@/components/labels/labels";
import { BuyerCard } from "./BuyerCard";
import { Chip, ChipRow, SearchBox } from "./Filters";

export function BuyerBrowser({
  buyers,
  patterns,
}: {
  buyers: Buyer[];
  patterns: { tag: string; buyerIds: string[] }[];
}) {
  const [query, setQuery] = useState("");
  const [strategy, setStrategy] = useState<BuyerStrategy | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const strategies = [...new Set(buyers.map((b) => b.strategy))];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return buyers.filter((b) => {
      if (strategy && b.strategy !== strategy) return false;
      if (tag && !b.tags.includes(tag)) return false;
      if (!q) return true;
      return [b.name, b.contactName, b.strategy, ...b.areas, ...b.propertyTypes, ...b.tags]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [buyers, query, strategy, tag]);

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} label="Search buyers" placeholder="Search name, area, property type…" />

      <div className="mt-3 space-y-2">
        <ChipRow label="Filter by strategy">
          <Chip active={strategy === null} onClick={() => setStrategy(null)}>
            All
          </Chip>
          {strategies.map((s) => (
            <Chip key={s} active={strategy === s} onClick={() => setStrategy(s)}>
              {s}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <section aria-labelledby="patterns-heading" className="mt-5">
        <h2 id="patterns-heading" className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          Buyer traits
        </h2>
        <ChipRow label="Filter by trait">
          {patterns.map((p) => (
            <Chip
              key={p.tag}
              tone="teal"
              active={tag === p.tag}
              onClick={() => setTag(tag === p.tag ? null : p.tag)}
              count={p.buyerIds.length}
            >
              {p.tag}
            </Chip>
          ))}
        </ChipRow>
      </section>

      <p className="mb-2.5 mt-5 px-1 text-xs text-faint" aria-live="polite">
        {results.length} of {buyers.length} buyers
      </p>

      {results.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3">
          {results.map((b, i) => (
            <li key={b.id} className="animate-rise-in" style={{ animationDelay: `${i * 30}ms` }}>
              <BuyerCard buyer={b} />
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
