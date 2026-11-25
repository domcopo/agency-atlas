import type { Metadata } from "next";
import { reviewIdea } from "@/app/actions";
import { IdeaForm } from "@/components/forms/RoleGuideForms";
import { Column, Columns } from "@/components/shell/Columns";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getIdeas, usesDatabase } from "@/lib/data-source";
import { IDEA_RULES, IDEA_STATUSES, ideaKindLabel, ideaStatusLabel, type Idea } from "@/lib/ideas";

export const metadata: Metadata = { title: "Ideas" };

const field = "min-h-10 rounded-xl border border-line bg-white/5 px-2 text-xs text-ink";

function IdeaText({ idea }: { idea: Idea }) {
  return (
    <>
      <p className="text-sm font-semibold">{idea.title}</p>
      <p className="text-[11px] text-faint">
        {ideaKindLabel(idea.kind)} · {idea.createdAt.slice(0, 10)}
        {idea.from ? ` · from ${idea.from}` : ""} · <span className={idea.status === "new" ? "font-semibold text-amber" : ""}>{ideaStatusLabel(idea.status)}</span>
      </p>
      {idea.details && <p className="mt-1 whitespace-pre-line text-xs text-muted">{idea.details}</p>}
    </>
  );
}

export default async function IdeasPage() {
  const ideas = await getIdeas();
  const newCount = ideas.inbox.filter((i) => i.status === "new").length;

  return (
    <>
      <PageHeader title="Ideas" subtitle="Feature ideas and requests for Atlas. Saved here only; nothing is sent anywhere." backHref="/kit" backLabel="Kit" />
      {!usesDatabase() ? (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Ideas are saved in the database, which isn&apos;t connected in this demo.</p>
      ) : !ideas.ready ? (
        <p className="rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm text-muted">
          <span className="font-semibold text-amber">One setup step needed.</span> {ideas.isOwner ? "Run 0036 in Supabase to turn on ideas." : "Ideas aren't turned on yet. Ask the owner."}
        </p>
      ) : (
        <Columns>
          <Column>
            <SectionTitle>Send an idea</SectionTitle>
            <div className="glass rounded-3xl p-4">
              <IdeaForm />
            </div>
            <SectionTitle aside={`${ideas.mine.length}`}>Your ideas</SectionTitle>
            {ideas.mine.length ? (
              <ul className="glass divide-y divide-line rounded-3xl">
                {ideas.mine.map((i) => (
                  <li key={i.id} className="px-4 py-2.5">
                    <IdeaText idea={{ ...i, from: null }} />
                    {i.reply && <p className="mt-1 rounded-xl bg-white/5 px-2.5 py-1.5 text-xs">Owner&apos;s reply: {i.reply}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">You haven&apos;t sent any ideas yet.</p>
            )}
          </Column>
          {ideas.isOwner && (
            <Column>
              <SectionTitle aside={newCount ? <span className="text-amber">{newCount} new</span> : `${ideas.inbox.length}`}>Ideas inbox (only you see this)</SectionTitle>
              {ideas.inbox.length ? (
                <ul className="glass divide-y divide-line rounded-3xl">
                  {ideas.inbox.map((i) => (
                    <li key={i.id} className="px-4 py-2.5">
                      <IdeaText idea={i} />
                      <form action={reviewIdea} className="mt-2 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={i.id} />
                        <label className="sr-only" htmlFor={`st-${i.id}`}>
                          Status
                        </label>
                        <select id={`st-${i.id}`} name="status" defaultValue={i.status} className={field}>
                          {IDEA_STATUSES.map((s) => (
                            <option key={s.status} value={s.status}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        <label className="sr-only" htmlFor={`re-${i.id}`}>
                          Reply the sender sees
                        </label>
                        <input id={`re-${i.id}`} name="reply" defaultValue={i.reply ?? ""} maxLength={IDEA_RULES.reply} placeholder="Short reply (optional)" className={`${field} min-w-0 flex-1 basis-40`} />
                        <button type="submit" className="pressable min-h-10 rounded-xl border border-line px-3 text-xs font-semibold">
                          Save
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No ideas yet.</p>
              )}
            </Column>
          )}
        </Columns>
      )}
    </>
  );
}
