import { Layers } from "lucide-react";
import type { Metadata } from "next";
import { DexBrowser } from "@/components/cards/DexBrowser";
import { EmptyState } from "@/components/labels/labels";
import { PageHeader } from "@/components/shell/PageHeader";
import { getBusinesses, getPatterns } from "@/lib/data-source";

export const metadata: Metadata = { title: "Business Dex" };

export default function DexPage() {
  const businesses = getBusinesses();
  return (
    <>
      <PageHeader
        title="Business Dex"
        subtitle={businesses.length ? "Sample case-study profiles. Every number shows how much to trust it." : "Long-term case studies of real businesses."}
        backHref="/growth"
        backLabel="Growth"
      />
      {businesses.length ? (
        <DexBrowser businesses={businesses} patterns={getPatterns()} />
      ) : (
        <EmptyState icon={<Layers className="size-5" />} title="No case studies yet">
          Case studies start once businesses answer the survey and agree to share their numbers. Nothing here is made up.
        </EmptyState>
      )}
    </>
  );
}
