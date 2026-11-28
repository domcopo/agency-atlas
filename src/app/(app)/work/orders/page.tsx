// The old Work orders page now lives inside the Work hub (docs/WORK_HUB_PLAN.md).
// This address keeps working: it sends you to /work with the same person, client,
// board view and status filter. One work order's own page (/work/orders/[id]) is unchanged.

import { redirect } from "next/navigation";
import { legacyOrdersHref } from "@/lib/work-hub";

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  redirect(legacyOrdersHref(one));
}
