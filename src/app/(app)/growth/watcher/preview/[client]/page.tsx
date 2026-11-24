// One client in the SEO Watcher sample (Phase A): visibility, keyword table,
// competitors, and whether next month's report would include an upsell section.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { SampleNotice, WATCH_BASE } from "@/components/watcher/Bits";
import { ClientDetail } from "@/components/watcher/ClientDetail";
import { getMember, getWatchPreview, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { buildClient } from "@/lib/watch/view";

export const metadata: Metadata = { title: "SEO Watcher client (sample)" };

export default async function WatcherClientPage({ params }: { params: Promise<{ client: string }> }) {
  if (usesDatabase() && !isLead((await getMember())?.role)) return <RoleNotice title="SEO Watcher" />;
  const { client: id } = await params;
  const preview = getWatchPreview();
  const view = buildClient(preview.data, id, preview.today);
  if (!view) notFound();

  return (
    <>
      <PageHeader title={view.client.name} subtitle={`${view.client.niche} · ${view.client.domain}`} backHref={WATCH_BASE} backLabel="Board" />
      <SampleNotice />
      <ClientDetail view={view} upsell />
    </>
  );
}
