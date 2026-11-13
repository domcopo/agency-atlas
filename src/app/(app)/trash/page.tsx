// Trash (0019, docs/TRASH_PLAN.md): what the owner or a manager moved out of the way.
// Restore puts it back exactly as it was. Only the owner can delete forever (the database
// refuses anyone else, and anything not in Trash). Developers never see this screen.

import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { DeleteForeverForm, RestoreButton } from "@/components/forms/TrashForms";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getMember, getTrash } from "@/lib/data-source";
import { deletionSummary, itemWord } from "@/lib/trash";

export const metadata: Metadata = { title: "Trash" };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

export default async function TrashPage({ searchParams }: { searchParams: Promise<{ moved?: string; refused?: string }> }) {
  const [me, trash, sp] = await Promise.all([getMember(), getTrash(), searchParams]);
  if (!me || (me.role !== "owner" && me.role !== "manager")) return <RoleNotice title="Trash" />;
  if (!trash.ready) {
    return (
      <>
        <PageHeader title="Trash" />
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Trash turns on after the 0019 setup step.</p>
      </>
    );
  }
  const clients = trash.entries.filter((e) => e.kind === "client");
  const items = trash.entries.filter((e) => e.kind === "item");
  return (
    <>
      <PageHeader
        title="Trash"
        subtitle={trash.canDelete ? "Moved out of the way. Restore anything, or delete it forever after you've reviewed it." : "Moved out of the way. Restore anything; only the owner can delete forever."}
      />
      {sp.moved && <p role="status" className="mb-3 rounded-2xl bg-lime/10 px-4 py-2 text-sm text-lime">Moved to Trash. Restore it here any time.</p>}
      {sp.refused && (
        <p role="alert" className="mb-3 rounded-2xl bg-rose/10 px-4 py-2 text-sm text-rose">
          {sp.refused === "billing" ? "That client has billing records, so it can't go to Trash. Mark it Ended instead." : "That couldn't be moved to Trash. Nothing was changed."}
        </p>
      )}

      {trash.entries.length === 0 && (
        <p className="glass flex items-center gap-2 rounded-3xl px-4 py-3 text-sm text-muted">
          <Trash2 aria-hidden className="size-4" /> Trash is empty.
        </p>
      )}

      {clients.length > 0 && (
        <>
          <SectionTitle aside={`${clients.length}`}>Clients</SectionTitle>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {clients.map((e) => (
              <li key={e.id} className="space-y-2 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{e.name}</p>
                  <p className="text-[11px] text-muted">
                    Trashed {when(e.trashedAt)}
                    {e.byMe ? " by you" : ""} · {e.attached} item{e.attached === 1 ? "" : "s"} go with it
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RestoreButton kind="client" id={e.id} />
                  {trash.canDelete && <DeleteForeverForm kind="client" id={e.id} what={e.name} />}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {items.length > 0 && (
        <>
          <SectionTitle aside={`${items.length}`}>Work orders, follow-ups and issues</SectionTitle>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {items.map((e) => (
              <li key={e.id} className="space-y-2 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{e.name}</p>
                  <p className="text-[11px] text-muted">
                    {itemWord(e.itemKind ?? "")}
                    {e.clientName ? ` · ${e.clientName}` : ""} · trashed {when(e.trashedAt)}
                    {e.byMe ? " by you" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RestoreButton kind="item" id={e.id} />
                  {trash.canDelete && <DeleteForeverForm kind="item" id={e.id} what={e.name} />}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {trash.canDelete && (
        <>
          <SectionTitle>Deleted forever (last 30 days)</SectionTitle>
          <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">
            {trash.deletions.length ? deletionSummary(trash.deletions) : "Nothing."} Atlas keeps only the type, who and when: no names or contents. Supabase&apos;s daily backups (kept 7 days) are the only way back.
          </p>
        </>
      )}
    </>
  );
}
