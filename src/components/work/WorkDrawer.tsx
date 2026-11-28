// The Work hub detail drawer (Phase 2, docs/WORK_HUB_PLAN.md): opened by ?open=<id>.
// Work orders load their comments and history (getWorkOrderDetail, the database decides
// who may read them). Issues and follow-ups show their own fields only.

import { DrawerShell } from "@/components/work/DrawerShell";
import { WorkOrderDetail, type DetailViewer } from "@/components/work/WorkOrderDetail";
import { getWorkOrderDetail } from "@/lib/data-source";
import type { ClientAction } from "@/lib/types";

export async function WorkDrawer({
  item,
  closeHref,
  viewer,
  staff,
  today,
  leadName,
  doneWhenReady,
}: {
  item: ClientAction;
  closeHref: string;
  viewer: DetailViewer;
  staff: { id: string; name: string }[];
  today: string;
  leadName?: string;
  doneWhenReady: boolean;
}) {
  const detail = item.kind === "work_order" ? await getWorkOrderDetail(item.id) : null;
  const a = detail?.action ?? item;
  return (
    <DrawerShell id={a.id} title={a.title} closeHref={closeHref} fullHref={a.kind === "work_order" ? `/work/orders/${a.id}` : undefined}>
      <WorkOrderDetail
        key={a.id}
        a={a}
        thread={detail ? { comments: detail.comments, history: detail.history, ready: detail.ready } : null}
        viewer={viewer}
        staff={staff}
        today={today}
        layout="drawer"
        leadName={leadName}
        doneWhenReady={doneWhenReady}
      />
    </DrawerShell>
  );
}
