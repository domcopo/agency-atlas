import type { Metadata } from "next";
import { DexBrowser } from "@/components/cards/DexBrowser";
import { PageHeader } from "@/components/shell/PageHeader";
import { getBusinesses, getPatterns } from "@/lib/data-source";

export const metadata: Metadata = { title: "Business Dex" };

export default function DexPage() {
  const businesses = getBusinesses();
  return (
    <>
      <PageHeader
        title="Business Dex"
        subtitle="Sample case-study profiles. Every number shows how much to trust it."
        backHref="/growth"
        backLabel="Growth"
      />
      <DexBrowser businesses={businesses} patterns={getPatterns()} />
    </>
  );
}
