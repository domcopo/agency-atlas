// One work order (0017): details, steps, links, status, reassignment, comments, history.
// Owner and managers reach any work order; developers only their current ones (and the
// database decides that, plus who can see the comments and history).
// The body is shared with the Work hub drawer (src/components/work/WorkOrderDetail.tsx):
// developers get their big buttons, owner and managers edit each field in place.

import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { WorkOrderDetail } from "@/components/work/WorkOrderDetail";
import { getActions, getDeveloperViewer, getMember, getTeam, getToday, getWorkOrderDetail } from "@/lib/data-source";
import { clientLabel } from "@/lib/agency";

export const metadata: Metadata = { title: "Work order" };

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getWorkOrderDetail(id);
  if (!detail) notFound(); // missing, or not this person's (the database decides)
  const { action: a, comments, history, ready } = detail;
  const [viewer, me, team] = await Promise.all([getDeveloperViewer(), getMember(), getTeam()]);
  const developer = Boolean(viewer);
  // Never both: a developer (or someone previewing one) is never treated as a manager here.
  const manager = !developer && (me?.role === "owner" || me?.role === "manager");
  const owner = !developer && me?.role === "owner";
  const doneWhenReady = manager && (await getActions()).doneWhen;

  return (
    <>
      <PageHeader
        title={a.title}
        subtitle={`${clientLabel(a)} · Work order`}
        action={
          <Link href={developer ? "/work" : `/work?open=${a.id}`} className="pressable glass flex min-h-11 items-center gap-1 rounded-2xl px-3 text-xs font-semibold">
            <ArrowLeft aria-hidden className="size-3.5" /> {developer ? "Work" : "All work"}
          </Link>
        }
      />

      {!ready && (
        <p className="mb-3 rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm">
          <span className="font-semibold text-amber">One setup step needed.</span> <span className="text-muted">Run 0017 in Supabase to turn on comments, history, links and hours.</span>
        </p>
      )}

      <WorkOrderDetail
        a={a}
        thread={{ comments, history, ready }}
        viewer={{ developer, manager, owner, preview: Boolean(viewer?.preview) }}
        staff={team.members.map((m) => ({ id: m.id, name: m.name }))}
        today={getToday()}
        layout="page"
        doneWhenReady={doneWhenReady}
      />
    </>
  );
}
