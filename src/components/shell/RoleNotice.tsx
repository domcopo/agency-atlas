// Shown to developers and salespeople on screens their role doesn't use. This is a
// courtesy, not the lock: the database's security rules already return nothing to them here.

import { Lock } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { getMember } from "@/lib/data-source";
import { isSales } from "@/lib/roles";

export async function RoleNotice({ title }: { title: string }) {
  const sales = isSales((await getMember())?.role);
  return (
    <>
      <PageHeader title={title} />
      <div className="glass flex gap-3 rounded-3xl p-4 text-sm">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
        {sales ? (
          <p className="text-muted">
            This screen isn&apos;t part of the sales view. Your leads and follow-ups are on{" "}
            <Link href="/sales" className="font-semibold text-violet underline-offset-2 hover:underline">
              Sales
            </Link>
            .
          </p>
        ) : (
          <p className="text-muted">
            This screen isn&apos;t part of the developer view. Your follow-ups and issues are on{" "}
            <Link href="/work" className="font-semibold text-violet underline-offset-2 hover:underline">
              Work
            </Link>
            .
          </p>
        )}
      </div>
    </>
  );
}
