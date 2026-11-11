// One work order (0017): details, steps, links, status, reassignment, comments, history.
// Owner and managers reach any work order; developers only their current ones (and the
// database decides that, plus who can see the comments and history).

import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveWorkOrder, closeReassignRequest, updateAction } from "@/app/actions";
import { Step } from "@/components/cards/DeveloperWork";
import { ReviewButtons } from "@/components/cards/WorkOrderList";
import { CommentForm, HoursForm, InfoForm, ReassignRequestForm } from "@/components/forms/WorkOrderDetailForms";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getDeveloperViewer, getMember, getTeam, getToday, getWorkOrderDetail } from "@/lib/data-source";
import { cn } from "@/lib/format";
import { minutesLabel, needsReview, parseSteps, stepProgress } from "@/lib/ops";
import { DEADLINE_STYLE, deadlineColor, deadlineText, historyText, hoursLabel, linkLabel, PRIORITY_WORD, STATUS_WORD } from "@/lib/work-orders";

export const metadata: Metadata = { title: "Work order" };

const field = "min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white/5 px-3 text-sm text-ink disabled:opacity-50";
const btn = "pressable min-h-11 shrink-0 rounded-xl border border-line bg-white/5 px-3 text-sm font-semibold disabled:opacity-50";
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getWorkOrderDetail(id);
  if (!detail) notFound(); // missing, or not this person's (the database decides)
  const { action: a, comments, history, ready } = detail;
  const [viewer, me, team] = await Promise.all([getDeveloperViewer(), getMember(), getTeam()]);
  const today = getToday();
  const preview = Boolean(viewer?.preview);
  const developer = Boolean(viewer);
  const manager = !developer && (me?.role === "owner" || me?.role === "manager");
  const owner = !developer && me?.role === "owner";
  const color = deadlineColor(a.dueOn, today, a.status);
  const steps = parseSteps(a.steps);
  const progress = stepProgress(a);
  const finished = a.status === "done" || a.status === "canceled";
  const staff = team.members.map((m) => ({ id: m.id, name: m.name }));

  return (
    <>
      <PageHeader
        title={a.title}
        subtitle={`${a.client?.name ?? "No client"} · Work order`}
        action={
          <Link href={developer ? "/work" : "/work/orders"} className="pressable glass flex min-h-11 items-center gap-1 rounded-2xl px-3 text-xs font-semibold">
            <ArrowLeft aria-hidden className="size-3.5" /> {developer ? "Work" : "All"}
          </Link>
        }
      />

      {!ready && (
        <p className="mb-3 rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm">
          <span className="font-semibold text-amber">One setup step needed.</span> <span className="text-muted">Run 0017 in Supabase to turn on comments, history, links and hours.</span>
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-semibold", DEADLINE_STYLE[color].text)}>
          <span className={cn("size-2 rounded-full", DEADLINE_STYLE[color].dot)} aria-hidden />
          {finished ? STATUS_WORD[a.status] : deadlineText(a.dueOn, today)}
        </span>
        <span className="rounded-full border border-line px-2.5 py-1">{STATUS_WORD[a.status]}</span>
        <span className="rounded-full border border-line px-2.5 py-1">{PRIORITY_WORD[a.priority]}</span>
        {a.archivedAt && <span className="rounded-full border border-line px-2.5 py-1 text-faint">Archived</span>}
      </div>

      {a.status === "blocked" && <p className="mb-3 rounded-2xl border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose">Blocked: {a.blockedReason || "no reason given"}</p>}
      {a.reviewNote && a.status !== "review" && !finished && <p className="mb-3 rounded-2xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">Sent back: {a.reviewNote}</p>}

      {a.reassignReason && (
        <div className="mb-3 rounded-2xl border border-amber/50 bg-amber/10 p-3 text-sm">
          <p className="font-semibold text-amber">Needs reassignment</p>
          <p className="text-muted">
            {a.reassignReason}
            {a.reassignRequestedAt ? ` · asked ${when(a.reassignRequestedAt)}` : ""}
          </p>
          {manager && (
            <form action={closeReassignRequest} className="mt-2">
              <input type="hidden" name="actionId" value={a.id} />
              <button type="submit" className={btn}>
                Keep it as is (close request)
              </button>
            </form>
          )}
        </div>
      )}

      <dl className="glass grid grid-cols-2 gap-x-3 gap-y-2 rounded-3xl p-4 text-sm">
        <div>
          <dt className="text-[11px] text-muted">Assigned to</dt>
          <dd className="font-semibold">{a.ownerName ?? "No one yet"}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Client</dt>
          <dd className="font-semibold">{a.client ? manager ? <Link href={`/clients/${a.client.slug}`} className="hover:underline">{a.client.name}</Link> : a.client.name : "None"}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Start</dt>
          <dd>{a.startOn ?? "–"}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Due</dt>
          <dd className={DEADLINE_STYLE[color].text}>{a.dueOn ?? "No date"}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Estimate</dt>
          <dd>{a.estMinutes ? minutesLabel(a.estMinutes) : "–"}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Actual</dt>
          <dd>{hoursLabel(a.actualMinutes)}</dd>
        </div>
        {a.promisedOn && (
          <div className="col-span-2">
            <dt className="text-[11px] text-muted">Promised to the client by</dt>
            <dd className="text-amber">{a.promisedOn}</dd>
          </div>
        )}
      </dl>

      {(a.notes || steps.length > 0) && (
        <>
          <SectionTitle aside={progress ? `${progress.done} of ${progress.total} done` : undefined}>What needs doing</SectionTitle>
          <div className="glass space-y-2 rounded-3xl p-4">
            {a.notes && <p className="whitespace-pre-wrap text-sm text-muted">{a.notes}</p>}
            {steps.length > 0 && (
              <ol className="space-y-1">
                {steps.map((s, i) => (
                  <Step key={`${i}-${s}`} a={a} n={i + 1} text={s} ticked={progress?.ticked.has(i + 1) ?? false} readOnly={preview || finished || a.status === "review"} />
                ))}
              </ol>
            )}
          </div>
        </>
      )}

      {((a.links?.length ?? 0) > 0 || a.sourceLink) && (
        <>
          <SectionTitle>Links</SectionTitle>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {[...(a.links ?? []), ...(a.sourceLink ? [a.sourceLink] : [])].map((l) => (
              <li key={l}>
                <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="pressable flex min-h-12 items-center justify-between gap-2 px-4 text-sm">
                  <span className="truncate font-semibold text-violet">{l === a.sourceLink ? `Conversation${a.sourceNote ? ` (${a.sourceNote})` : ""}` : linkLabel(l)}</span>
                  <ExternalLink aria-hidden className="size-4 shrink-0 text-faint" />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {!finished && (
        <>
          <SectionTitle>Update</SectionTitle>
          <fieldset disabled={preview} className="glass space-y-3 rounded-3xl p-4">
            {a.status === "review" && manager ? (
              <ReviewButtons a={a} />
            ) : a.status === "review" ? (
              <p className="text-sm text-violet">Sent for review. A manager will approve it or send it back.</p>
            ) : (
              <form key={`status-${a.status}`} action={updateAction} className="space-y-2">
                <input type="hidden" name="actionId" value={a.id} />
                <input type="hidden" name="op" value="status" />
                <label className="block text-[11px] text-muted">
                  Status
                  <select name="status" defaultValue={a.status} className={`${field} mt-1 w-full`}>
                    <option value="open">New</option>
                    <option value="in_progress">In progress</option>
                    <option value="waiting">Waiting on client</option>
                    <option value="blocked">Blocked</option>
                    <option value="review">{needsReview(a) ? "Ready for review" : "In review"}</option>
                    {!developer && <option value="done">Done</option>}
                  </select>
                </label>
                <div className="flex gap-2">
                  <input name="reason" maxLength={200} defaultValue={a.blockedReason ?? ""} placeholder="If blocked: on what?" aria-label="What it's blocked on" className={field} />
                  <button type="submit" className={btn}>
                    Save
                  </button>
                </div>
              </form>
            )}

            <HoursForm actionId={a.id} minutes={a.actualMinutes ?? null} disabled={preview} />

            {manager && (
              <>
                <form key={`assign-${a.ownerId ?? ""}`} action={updateAction} className="flex items-end gap-2">
                  <input type="hidden" name="actionId" value={a.id} />
                  <input type="hidden" name="op" value="assign" />
                  <label className="min-w-0 flex-1 text-[11px] text-muted">
                    Assigned to
                    <select name="ownerId" defaultValue={a.ownerId ?? ""} className={`${field} mt-1 w-full`}>
                      <option value="">No one</option>
                      {staff.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className={btn}>
                    Reassign
                  </button>
                </form>
                <form key={`prio-${a.priority}`} action={updateAction} className="flex items-end gap-2">
                  <input type="hidden" name="actionId" value={a.id} />
                  <input type="hidden" name="op" value="priority" />
                  <label className="min-w-0 flex-1 text-[11px] text-muted">
                    Priority
                    <select name="priority" defaultValue={a.priority} className={`${field} mt-1 w-full`}>
                      {(["critical", "high", "normal", "low"] as const).map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_WORD[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className={btn}>
                    Save
                  </button>
                </form>
                <form key={`due-${a.dueOn ?? ""}`} action={updateAction} className="flex items-end gap-2">
                  <input type="hidden" name="actionId" value={a.id} />
                  <input type="hidden" name="op" value="reschedule" />
                  <label className="min-w-0 flex-1 text-[11px] text-muted">
                    Due date
                    <input type="date" name="due" required defaultValue={a.dueOn ?? ""} className={`${field} mt-1 w-full`} />
                  </label>
                  <button type="submit" className={btn}>
                    Save
                  </button>
                </form>
                <InfoForm actionId={a.id} start={a.startOn ?? null} links={a.links ?? []} due={a.dueOn} />
              </>
            )}

            {developer && !a.reassignReason && (
              <div>
                <p className="mb-1 text-[11px] text-muted">Not the right person for this? Ask the owner to reassign it.</p>
                <ReassignRequestForm actionId={a.id} disabled={preview} />
              </div>
            )}
          </fieldset>
          {preview && <p className="mt-1 px-1 text-[11px] text-faint">Preview: look only.</p>}
        </>
      )}

      {owner && finished && (
        <form action={archiveWorkOrder} className="mt-3">
          <input type="hidden" name="actionId" value={a.id} />
          <input type="hidden" name="op" value={a.archivedAt ? "restore" : "archive"} />
          <button type="submit" className={btn}>
            {a.archivedAt ? "Take out of the archive" : "Archive (kept, never deleted)"}
          </button>
        </form>
      )}

      <SectionTitle aside={`${comments.length}`}>Comments</SectionTitle>
      <div className="glass space-y-3 rounded-3xl p-4">
        {comments.length ? (
          <ul className="space-y-2.5">
            {comments.map((c) => (
              <li key={c.id} className={cn("rounded-2xl px-3 py-2 text-sm", c.mine ? "bg-violet/10" : "bg-white/[0.04]")}>
                <p className="text-[11px] text-muted">
                  <span className="font-semibold text-ink">{c.mine ? "You" : c.authorName}</span> · {when(c.at)}
                </p>
                <p className="whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No comments yet.</p>
        )}
        {ready && <CommentForm actionId={a.id} disabled={preview} />}
        <p className="text-[11px] text-faint">Visible to the owner, managers and whoever this is assigned to. No client contact details here.</p>
      </div>

      <SectionTitle>History</SectionTitle>
      {history.length ? (
        <ol className="glass divide-y divide-line overflow-hidden rounded-3xl text-sm">
          {[...history].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`} className="px-4 py-2">
              <p>{historyText(h)}</p>
              <p className="text-[11px] text-faint">
                {h.actorName ?? "Someone"} · {when(h.at)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="glass rounded-2xl px-4 py-3 text-sm text-muted">{ready ? "No changes recorded yet." : "History starts after the 0017 setup step."}</p>
      )}
      <p className="mt-1 px-1 text-[11px] text-faint">Recorded by the database itself; nobody can edit or delete it.</p>
    </>
  );
}
