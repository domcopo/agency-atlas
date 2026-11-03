import { Compass } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/labels/labels";

export default function NotFound() {
  return (
    <div className="pt-16">
      <EmptyState icon={<Compass className="size-5" />} title="Page not found">
        <p>That page or record doesn&apos;t exist.</p>
        <Link href="/" className="mt-3 inline-block font-semibold text-violet">
          Back to Mission Control
        </Link>
      </EmptyState>
    </div>
  );
}
