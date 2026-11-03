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
        subtitle="A field guide to how businesses grow. Every number shows how much to trust it."
      />
      <DexBrowser businesses={businesses} patterns={getPatterns()} />
    </>
  );
}
