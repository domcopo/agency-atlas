import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { kitDocOp } from "@/app/actions";
import { CopyButton } from "@/components/cards/CopyButton";
import { KitDocForm } from "@/components/forms/KitDocForm";
import { KitText } from "@/components/kit/KitText";
import { Fold } from "@/components/shell/Fold";
import { PageHeader } from "@/components/shell/PageHeader";
import { getKitDoc, getDeveloperViewer, getMember, getToday, usesDatabase } from "@/lib/data-source";
import { kitKindLabel, plainText, reviewNote } from "@/lib/kit";

export const metadata: Metadata = { title: "Kit" };

const btn = "pressable min-h-10 rounded-xl border border-line bg-white/5 px-3 text-xs font-semibold";

export default async function KitDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getKitDoc(id);
  if (!found) notFound(); // missing, or not meant for this person (the database decides)
  const { doc, versions } = found;
  const member = usesDatabase() ? await getMember() : null;
  // Previewing a developer: no editing (look only), like the developer sees it.
  const editor = (member?.role === "owner" || member?.role === "manager") && !(await getDeveloperViewer())?.preview;
  const today = getToday();
  const stale = reviewNote(doc, today);

  return (
    <>
      <PageHeader
        title={doc.title}
        subtitle={`${kitKindLabel(doc.kind)}${doc.category ? ` · ${doc.category}` : ""}${doc.archived ? " · archived" : ""}`}
        backHref="/kit"
        backLabel="Kit"
      />

      {editor && (
        <p className="mb-3 px-1 text-[11px] text-faint">
          Readable by you{doc.audience.includes("manager") ? ", managers" : ""}
          {doc.audience.includes("developer") ? ", developers" : ""}. Last changed {doc.updatedAt.slice(0, 10)}
          {doc.reviewedOn ? ` · reviewed ${doc.reviewedOn}` : ""}
          {stale ? <span className="font-semibold text-amber"> · {stale}</span> : null}
        </p>
      )}

      <article className="glass rounded-3xl p-4">
        <KitText body={doc.body} />
      </article>

      <div className="mt-3 flex flex-wrap gap-2">
        {doc.kind === "template" && <CopyButton text={plainText(doc.body)} label={`Copy "${doc.title}"`} />}
        {editor && (doc.kind === "sop" || doc.kind === "readme") && (
          <form action={kitDocOp}>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="op" value="reviewed" />
            <button type="submit" className={btn}>
              Mark reviewed today
            </button>
          </form>
        )}
        {editor && (
          <form action={kitDocOp}>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="op" value={doc.archived ? "unarchive" : "archive"} />
            <button type="submit" className={btn}>
              {doc.archived ? "Bring back" : "Archive (hide from the team)"}
            </button>
          </form>
        )}
      </div>

      {editor && (
        <div className="mt-5 space-y-2.5">
          <Fold label="Edit this page" title="Edit" summary="Every save is kept in the history">
            <div className="glass rounded-3xl p-4">
              <KitDocForm key={doc.updatedAt} doc={doc} />
            </div>
          </Fold>
          <Fold label="Version history" title="History" summary={`${versions.length} saved version${versions.length === 1 ? "" : "s"} · kept by the database, can't be changed`}>
            <ul className="glass divide-y divide-line rounded-3xl">
              {versions.map((v, i) => (
                <li key={v.id} className="px-4 py-2">
                  <details>
                    <summary className="pressable flex min-h-10 cursor-pointer list-none items-center gap-2 text-xs">
                      <span className="flex-1">
                        <span className="font-semibold text-ink">{v.savedAt.slice(0, 16).replace("T", " ")}</span> · {v.savedBy}
                        {i === 0 ? <span className="text-lime"> · current</span> : null}
                      </span>
                      <span className="text-faint">View</span>
                    </summary>
                    <div className="mt-2 rounded-2xl border border-line p-3">
                      <p className="mb-1 text-xs font-semibold">{v.title}</p>
                      <KitText body={v.body} />
                      {i > 0 && <CopyButton text={v.body} label="Copy this version's text (paste it into Edit to bring it back)" />}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </Fold>
        </div>
      )}
    </>
  );
}
