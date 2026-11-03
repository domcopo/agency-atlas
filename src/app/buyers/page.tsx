import type { Metadata } from "next";
import { BuyerBrowser } from "@/components/cards/BuyerBrowser";
import { PageHeader } from "@/components/shell/PageHeader";
import { getBuyerPatterns, getBuyers } from "@/lib/data-source";

export const metadata: Metadata = { title: "Buyers Dex" };

export default function BuyersPage() {
  const buyers = getBuyers();
  return (
    <>
      <PageHeader title="Buyers Dex" subtitle="Cash buyers, what they buy and how reliable they are." backHref="/more" backLabel="More" />
      <BuyerBrowser buyers={buyers} patterns={getBuyerPatterns()} />
    </>
  );
}
