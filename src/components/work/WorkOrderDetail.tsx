// One item's details, shared by the work order page (/work/orders/[id]) and the Work hub
// drawer (docs/WORK_HUB_PLAN.md, Phase 2).
// - Owner and managers: every field edits in place and saves on its own (DrawerFields).
// - Developers (and Preview as a developer): exactly as before. Big status buttons, hours,
//   "Needs reassignment", comments. The database decides what they may change.
// Issues and follow-ups have no comments or history (those are work orders only, 0017).

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { archiveWorkOrder, closeReassignRequest } from "@/app/actions";
import { DeveloperButtons } from "@/components/cards/DeveloperButtons";
import { Step } from "@/components/cards/DeveloperWork";
import { ReviewButtons } from "@/components/cards/WorkOrderList";
import { CommentForm, HoursForm, ReassignRequestForm } from "@/components/forms/WorkOrderDetailForms";
import { MoveToTrashButton } from "@/components/forms/TrashForms";
import { Column, Columns } from "@/components/shell/Columns";
import { SectionTitle } from "@/components/shell/PageHeader";
import { DateField, DoneWhenField, GhlLinkField, HoursField, PickField, StartLinksField, StatusField, StepsField, TitleNotesField } from "@/components/work/DrawerFields";
import { clientLabel } from "@/lib/agency";
import { cn } from "@/lib/format";
import { EST_OPTIONS, kindLabel, minutesLabel, parseSteps, stepProgress } from "@/lib/ops";
import type { ClientAction } from "@/lib/types";
import { DEADLINE_STYLE, deadlineColor, deadlineText, historyText, hoursLabel, linkLabel, PRIORITY_WORD, STATUS_WORD, type HistoryEntry } from "@/lib/work-orders";

const btn = "pressable min-h-11 shrink-0 rounded-xl border border-line bg-white/5 px-3 text-sm font-semibold disabled:opacity-50";
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export interface DetailViewer {
  developer: boolean;
  manager: boolean;
  owner: boolean;
  /** Preview as a developer: look only. */
  preview: boolean;
}

export interface DetailProps {
  a: ClientAction;
  /** Work orders only (0017): comments and history. null = an issue or follow-up. */
  thread: { comments: { id: string; mine: boolean; authorName: string; body: string; at: string }[]; history: HistoryEntry[]; ready: boolean } | null;
  viewer: DetailViewer;
  staff: { id: string; name: string }[];
  today: string;
  /** "drawer": one column; "page": two columns on wide screens. */
  layout: "page" | "drawer";
  /** A lead follow-up's lead name, when there's no client. */
  leadName?: string;
  /** 0038 has been run ("Done when" can be saved). */
  doneWhenReady?: boolean;
}

export function WorkOrderDetail({ a, thread, viewer, staff, today, layout, leadName, doneWhenReady = false }: DetailProps) {
  const { developer, manager, owner, preview } = viewer;
  const color = deadlineColor(a.dueOn, today, a.status);
  const steps = parseSteps(a.steps);
  const progress = stepProgress(a);
  const finished = a.status === "done" || a.status === "canceled";
  const workOrder = a.kind === "work_order";
  const editing = manager && !finished;
  const allLinks = [...(a.links ?? []), ...(a.sourceLink ? [a.sourceLink] : [])];

  const badges = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={cn("inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 font-semibold", DEADLINE_STYLE[color].text)}>
        <span className={cn("size-2 rounded-full", DEADLINE_STYLE[color].dot)} aria-hidden />
        {finished ? STATUS_WORD[a.status] : deadlineText(a.dueOn, today)}
      </span>
      <span className={cn("rounded-full border px-3 py-1", a.status === "blocked" ? "border-rose/50 text-rose" : "border-line")}>{STATUS_WORD[a.status]}</span>
      <span className="rounded-full border border-line px-3 py-1">{PRIORITY_WORD[a.priority]}</span>
      {!workOrder && <span className="rounded-full border border-line px-3 py-1 text-muted">{kindLabel(a.kind)}</span>}
      {a.archivedAt && <span className="rounded-full border border-line px-3 py-1 text-muted">Archived</span>}
    </div>
  );

  const banners = (
    <>
      {a.status === "blocked" && !editing && <p className="rounded-2xl border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose">Blocked: {a.blockedReason || "no reason given"}</p>}
      {a.reviewNote && a.status !== "review" && !finished && <p className="rounded-2xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">Sent back: {a.reviewNote}</p>}
      {a.reassignReason && (
        <div className="rounded-2xl border border-amber/50 bg-amber/10 p-3 text-sm">
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
      {a.status === "review" && manager && <ReviewButtons a={a} />}
    </>
  );

  // Owner and managers, while it's open: everything edits in place.
  const managerFields = editing && (
    <section aria-label="Details" className="glass space-y-3 rounded-2xl p-4">
      <TitleNotesField id={a.id} title={a.title} notes={a.notes} workOrder={workOrder} />
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <StatusField id={a.id} status={a.status} reason={a.blockedReason ?? null} />
        </div>
        <PickField id={a.id} op="assign" name="ownerId" label="Owner" value={a.ownerId ?? ""} options={[{ value: "", label: "No one" }, ...staff.map((m) => ({ value: m.id, label: m.name }))]} />
        <DateField id={a.id} op="reschedule" name="due" label="Due date" value={a.dueOn} />
        <PickField id={a.id} op="priority" name="priority" label="Priority" value={a.priority} options={(["critical", "high", "normal", "low"] as const).map((p) => ({ value: p, label: PRIORITY_WORD[p] ?? p }))} />
        <PickField
          id={a.id}
          op="est"
          name="est"
          label="Estimate"
          value={a.estMinutes && EST_OPTIONS.some(([v]) => v === a.estMinutes) ? String(a.estMinutes) : ""}
          options={[{ value: "", label: "Not sure" }, ...EST_OPTIONS.map(([v, l]) => ({ value: String(v), label: l }))]}
        />
        <DateField id={a.id} op="promise" name="promised" label="Promised to client by" value={a.promisedOn ?? null} allowEmpty />
        {workOrder && <HoursField id={a.id} minutes={a.actualMinutes ?? null} />}
      </div>
      {a.client && (
        <p className="text-sm text-muted">
          Client:{" "}
          <Link href={`/clients/${a.client.slug}`} className="font-semibold text-ink hover:underline">
            {a.client.name}
          </Link>
        </p>
      )}
      {!a.client && <p className="text-sm text-muted">Client: {a.internal ? clientLabel(a) : leadName ? `Lead: ${leadName}` : "None"}</p>}
    </section>
  );

  // Everyone else (developers, or finished work): the facts, read only.
  const facts = !editing && (
    <dl className="glass grid grid-cols-2 gap-x-3 gap-y-2 rounded-2xl p-4 text-sm">
      <div>
        <dt className="text-xs text-muted">Assigned to</dt>
        <dd className="font-semibold">{a.ownerName ?? "No one yet"}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Client</dt>
        <dd className="font-semibold">{a.client ? manager ? <Link href={`/clients/${a.client.slug}`} className="hover:underline">{a.client.name}</Link> : a.client.name : leadName ? `Lead: ${leadName}` : clientLabel(a, "None")}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Start</dt>
        <dd>{a.startOn ?? "–"}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Due</dt>
        <dd className={DEADLINE_STYLE[color].text}>{a.dueOn ?? "No date"}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Estimate</dt>
        <dd>{a.estMinutes ? minutesLabel(a.estMinutes) : "–"}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Actual</dt>
        <dd>{hoursLabel(a.actualMinutes)}</dd>
      </div>
      {a.promisedOn && (
        <div className="col-span-2">
          <dt className="text-xs text-muted">Promised to the client by</dt>
          <dd className="text-amber">{a.promisedOn}</dd>
        </div>
      )}
    </dl>
  );

  const checklist = (steps.length > 0 || (a.notes && !editing) || editing || a.doneWhen) && (
    <section aria-label="Steps">
      <SectionTitle aside={progress ? `${progress.done} of ${progress.total} done` : undefined}>Steps</SectionTitle>
      <div className="glass space-y-2 rounded-2xl p-4">
        {editing ? (
          doneWhenReady ? (
            <DoneWhenField key={a.doneWhen ?? ""} id={a.id} value={a.doneWhen ?? null} />
          ) : (
            <p className="text-xs text-muted">Done when: needs one setup step (0038 SQL).</p>
          )
        ) : (
          a.doneWhen && (
            <p className="rounded-xl border border-lime/30 bg-lime/5 px-3 py-2 text-sm">
              <span className="font-semibold text-lime">Done when: </span>
              {a.doneWhen}
            </p>
          )
        )}
        {a.notes && !editing && <p className="whitespace-pre-wrap text-sm text-muted">{a.notes}</p>}
        {steps.length > 0 ? (
          <ol className="space-y-1">
            {steps.map((s, i) => (
              <Step key={`${i}-${s}`} a={a} n={i + 1} text={s} ticked={progress?.ticked.has(i + 1) ?? false} readOnly={preview || finished || a.status === "review"} />
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">No steps yet.</p>
        )}
        {editing && (
          <details className="border-t border-line pt-2">
            <summary className="pressable inline-flex min-h-10 cursor-pointer list-none items-center text-sm font-semibold text-ink underline-offset-2 hover:underline">Edit steps</summary>
            <div className="mt-2">
              <StepsField key={a.steps ?? ""} id={a.id} steps={steps.join("\n")} />
            </div>
          </details>
        )}
      </div>
    </section>
  );

  const links = (allLinks.length > 0 || editing) && (
    <section aria-label="Links and files">
      <SectionTitle>GoHighLevel &amp; links</SectionTitle>
      <div className="glass space-y-3 rounded-2xl p-4">
        {allLinks.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {allLinks.map((l) => (
              <li key={l}>
                <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="pressable flex min-h-11 items-center justify-between gap-2 px-3 text-sm hover:bg-white/[0.04]">
                  <span className="truncate font-semibold text-ink">{l === a.sourceLink ? `GoHighLevel conversation${a.sourceNote ? ` (${a.sourceNote})` : ""}` : linkLabel(l)}</span>
                  <ExternalLink aria-hidden className="size-4 shrink-0 text-muted" />
                </a>
              </li>
            ))}
          </ul>
        )}
        {editing && (
          <>
            <GhlLinkField id={a.id} link={a.sourceLink ?? null} linkNote={a.sourceNote ?? null} />
            {workOrder && <StartLinksField id={a.id} start={a.startOn ?? null} links={a.links ?? []} due={a.dueOn} />}
            <p className="text-xs text-muted">Files: paste a link (Google Drive, Figma…). Uploading files into the app isn&apos;t built yet.</p>
          </>
        )}
      </div>
    </section>
  );

  // Developers: the same big buttons as their Work card (DEVELOPER_SIMPLIFY_PLAN), unchanged.
  const developerUpdate = developer && !finished && (
    <section aria-label="Update">
      <SectionTitle>Update</SectionTitle>
      <fieldset disabled={preview} className="glass space-y-3 rounded-2xl p-4">
        {a.status === "review" ? <p className="text-sm text-violet">Sent for review. A manager will approve it or send it back.</p> : <DeveloperButtons a={a} disabled={preview} showWaiting />}
        <HoursForm actionId={a.id} minutes={a.actualMinutes ?? null} disabled={preview} />
        {!a.reassignReason && (
          <div>
            <p className="mb-1 text-xs text-muted">Not the right person for this? Ask the owner to reassign it.</p>
            <ReassignRequestForm actionId={a.id} disabled={preview} />
          </div>
        )}
      </fieldset>
      {preview && <p className="mt-1 px-1 text-xs text-muted">Preview: look only.</p>}
    </section>
  );

  const housekeeping = manager && (
    <div className="flex flex-wrap items-center gap-2">
      {owner && finished && workOrder && (
        <form action={archiveWorkOrder}>
          <input type="hidden" name="actionId" value={a.id} />
          <input type="hidden" name="op" value={a.archivedAt ? "restore" : "archive"} />
          <button type="submit" className={btn}>
            {a.archivedAt ? "Take out of the archive" : "Archive (kept, never deleted)"}
          </button>
        </form>
      )}
      <MoveToTrashButton kind="item" id={a.id} what={`"${a.title}"`} note="For mistakes, duplicates or old junk. Finished work can be archived instead." />
    </div>
  );

  const conversation = thread && (
    <>
      <section aria-label="Comments">
        <SectionTitle aside={`${thread.comments.length}`}>Comments</SectionTitle>
        <div className="glass space-y-3 rounded-2xl p-4">
          {thread.comments.length ? (
            <ul className="space-y-3">
              {thread.comments.map((c) => (
                <li key={c.id} className={cn("rounded-2xl px-3 py-2 text-sm", c.mine ? "bg-violet/10" : "bg-white/[0.04]")}>
                  <p className="text-xs text-muted">
                    <span className="font-semibold text-ink">{c.mine ? "You" : c.authorName}</span> · {when(c.at)}
                  </p>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No comments yet.</p>
          )}
          {thread.ready && <CommentForm actionId={a.id} disabled={preview} />}
          <p className="text-xs text-muted">Visible to the owner, managers and whoever this is assigned to. No client contact details here.</p>
        </div>
      </section>
      {developer ? (
        // Developers: history folds away behind a tap, to keep the page short.
        <details className="mt-5">
          <summary className="pressable flex min-h-11 cursor-pointer list-none items-center px-1 text-sm font-semibold text-violet">Show history ({thread.history.length})</summary>
          <History history={thread.history} ready={thread.ready} />
        </details>
      ) : (
        <section aria-label="Activity">
          <SectionTitle>Activity</SectionTitle>
          <History history={thread.history} ready={thread.ready} />
        </section>
      )}
    </>
  );

  if (layout === "drawer") {
    return (
      <div className="space-y-3">
        {badges}
        {banners}
        {managerFields}
        {facts}
        {checklist}
        {links}
        {developerUpdate}
        {conversation}
        <div className="pt-2">{housekeeping}</div>
      </div>
    );
  }
  return (
    <>
      <div className="mb-3 space-y-3">
        {badges}
        {banners}
      </div>
      <Columns>
        <Column>
          {managerFields}
          {facts}
          {checklist}
          {links}
        </Column>
        <Column>
          {developerUpdate}
          {conversation}
          <Spacer>{housekeeping}</Spacer>
        </Column>
      </Columns>
    </>
  );
}

function Spacer({ children }: { children: ReactNode }) {
  return <div className="mt-4">{children}</div>;
}

function History({ history, ready }: { history: HistoryEntry[]; ready: boolean }) {
  return (
    <>
      {history.length ? (
        <ol className="glass divide-y divide-line overflow-hidden rounded-2xl text-sm">
          {[...history].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`} className="px-4 py-2">
              <p>{historyText(h)}</p>
              <p className="text-xs text-muted">
                {h.actorName ?? "Someone"} · {when(h.at)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="glass rounded-2xl px-4 py-3 text-sm text-muted">{ready ? "No changes recorded yet." : "History starts after the 0017 setup step."}</p>
      )}
      <p className="mt-1 px-1 text-xs text-muted">Recorded by the database itself; nobody can edit or delete it.</p>
    </>
  );
}
