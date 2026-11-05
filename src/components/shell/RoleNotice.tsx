// Shown to developers on screens their role doesn't use. This is a courtesy, not
// the lock: the database's security rules already return nothing to them here.

import { Lock } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";

export function RoleNotice({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="glass flex gap-3 rounded-3xl p-4 text-sm">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
        <p className="text-muted">
          This screen isn&apos;t part of the developer view. Your follow-ups and issues are on{" "}
          <Link href="/work" className="font-semibold text-violet underline-offset-2 hover:underline">
            Work
          </Link>
          .
        </p>
      </div>
    </>
  );
}
