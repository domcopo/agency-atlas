// SEO Watcher board on the fictional sample (Phase A). Every number is computed in
// src/lib/watch/ from sample data; nothing is fetched.

import { MapPinned } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { WatchBoard } from "@/components/watcher/Board";
import { RoomLine, SampleNotice, WATCH_BASE, WatchTabs } from "@/components/watcher/Bits";
import { getMember, getWatchPreview, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { roomNotice } from "@/lib/watch/compute";
import { buildBoard } from "@/lib/watch/view";

export const metadata: Metadata = { title: "SEO Watcher (sample)" };

export default async function WatcherBoardPage() {
  if (usesDatabase() && !isLead((await getMember())?.role)) return <RoleNotice title="SEO Watcher" />;
  const preview = getWatchPreview();
  const board = buildBoard(preview.data);

  return (
    <>
      <PageHeader title="SEO Watcher" subtitle="All watched clients' Google visibility, week by week." backHref="/growth/watcher" backLabel="SEO Watcher" />
      <SampleNotice />
      <WatchTabs active="Board" />

      <WatchBoard
        board={board}
        clientHref={(id) => `${WATCH_BASE}/${id}`}
        side={
          <>
            <SectionTitle>Spending and room</SectionTitle>
            <div className="glass space-y-1.5 rounded-3xl p-3.5 lg:p-5">
              <RoomLine notice={roomNotice("Watcher cap this month", preview.room.spentUsd, preview.room.capUsd, "usd")} />
              <RoomLine notice={roomNotice("Keywords for the busiest client", preview.room.keywordsUsed, preview.room.keywordsMax)} />
              <p className="text-[11px] text-faint">Sample numbers. The app asks you at 80% and never raises a cap itself.</p>
            </div>
          </>
        }
      />

      <SectionTitle>USA map</SectionTitle>
      <div className="glass flex items-center gap-3 rounded-3xl p-4 text-sm text-muted lg:p-6">
        <MapPinned aria-hidden className="size-5 shrink-0 text-sky" />
        <p>
          Comes in Phase C: all 50 states, clients colored by rank, main competitors and opportunity spots. Until then, see{" "}
          <Link href={`${WATCH_BASE}/opportunities`} className="font-semibold text-violet underline-offset-2 hover:underline">
            Opportunities
          </Link>
          .
        </p>
      </div>
    </>
  );
}
