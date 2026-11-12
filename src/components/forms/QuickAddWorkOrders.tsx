"use client";

// Smart add (docs/SMART_ADD_PLAN.md; was Quick add): type, talk, or drop up to 3
// screenshots. The AI outlines draft work orders with a suggested person (from real
// workload numbers) and a due date (checked by plain rules). NOTHING is saved until a
// person taps Confirm, or edits a draft and adds it. Pictures are shrunk here on the
// device first (which also drops location data), sent once, and never stored.

import { Check, ImagePlus, Mic, MicOff, Sparkles, X } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createWorkOrder, quickAddWorkOrders, type QuickAddState } from "@/app/actions";
import { nearestEst, WorkOrderForm } from "@/components/forms/WorkOrderForm";
import { minutesLabel } from "@/lib/ops";
import type { WorkOrderDraft } from "@/lib/types";
import { DEADLINE_STYLE, deadlineColor, deadlineText } from "@/lib/work-orders";

const field = "mt-1 w-full rounded-xl border border-line bg-white/5 px-3 py-2 text-sm text-ink";
const MAX_SIDE = 1568; // the AI reads pictures best up to this size
const MAX_PICTURES = 3;

/** Shrink a picture to JPEG (max 1568px on the long side). Drawing it fresh drops location and camera data. */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!blob) throw new Error("no image");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

// The browser's own speech-to-text (Safari on iPhone, Chrome). Not every browser has it.
type Recognizer = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const noSubscribe = () => () => {};

/** "Add without AI": first line → title (up to 120 characters), the rest → steps. */
export function fromNote(note: string): { title?: string; steps?: string } {
  const lines = note.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return {};
  const first = lines[0]!;
  if (first.length <= 120) return { title: first, steps: lines.slice(1).join("\n") || undefined };
  return { title: `${first.slice(0, 117).trimEnd()}…`, steps: lines.join("\n") };
}
function makeRecognizer(): Recognizer | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return R ? new R() : null;
}

export function QuickAddWorkOrders({
  clients,
  staff,
  today,
  disabled,
  disabledNote,
}: {
  clients: { slug: string; name: string }[];
  staff: { id: string; name: string }[];
  today: string;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const [state, run, pending] = useActionState<QuickAddState | undefined, FormData>(quickAddWorkOrders, undefined);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState("");
  const [listening, setListening] = useState(false);
  const [manual, setManual] = useState(false);
  // Known only in the browser (false while the page is drawn on the server).
  const canTalk = useSyncExternalStore(noSubscribe, () => Boolean(makeRecognizer()), () => false);
  const rec = useRef<Recognizer | null>(null);
  const shown = useRef(photos);
  useEffect(() => {
    shown.current = photos;
  }, [photos]);
  // Free the preview images when leaving the page.
  useEffect(() => () => shown.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function addFiles(list: FileList | File[]) {
    setPhotoError(null);
    const images = [...list].filter((f) => f.type.startsWith("image/"));
    if (!images.length) return setPhotoError("Only pictures (photos or screenshots) work here.");
    const room = MAX_PICTURES - photos.length;
    if (images.length > room) setPhotoError(`Up to ${MAX_PICTURES} pictures; the extra ones were left out.`);
    const added: { file: File; url: string }[] = [];
    for (const f of images.slice(0, Math.max(0, room))) {
      try {
        const small = await shrink(f);
        added.push({ file: small, url: URL.createObjectURL(small) });
      } catch {
        setPhotoError("Couldn't read one of those pictures here. Try a screenshot instead.");
      }
    }
    setPhotos((p) => [...p, ...added]);
  }

  function talk() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = makeRecognizer();
    if (!r) return;
    r.lang = "en-US";
    r.interimResults = false;
    r.continuous = true;
    const before = note;
    r.onresult = (e) => {
      const said = Array.from(e.results, (res) => res[0]?.transcript ?? "").join(" ").trim();
      setNote([before, said].filter(Boolean).join(before ? " " : ""));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    rec.current?.stop();
    const fd = new FormData();
    fd.set("note", note);
    for (const p of photos) fd.append("image", p.file);
    startTransition(() => run(fd));
  }

  return (
    <div className="space-y-2.5">
      <form
        onSubmit={submit}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) void addFiles(e.dataTransfer.files);
        }}
        className={`glass space-y-2.5 rounded-3xl p-4 ${dragging ? "outline-2 outline-violet outline-dashed" : ""}`}
      >
        <label className="block text-xs text-muted">
          What needs doing?
          <textarea
            name="note"
            rows={4}
            maxLength={3000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={disabled}
            placeholder={"e.g. The client says the contact form is broken and they want new homepage photos by Friday."}
            className={field}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {canTalk && (
            <button
              type="button"
              onClick={talk}
              disabled={disabled}
              aria-pressed={listening}
              className={`pressable inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${listening ? "border-rose/60 bg-rose/15 text-rose" : "border-line bg-white/5"}`}
            >
              {listening ? <MicOff aria-hidden className="size-4" /> : <Mic aria-hidden className="size-4" />}
              {listening ? "Stop" : "Talk"}
            </button>
          )}
          <input type="file" accept="image/*" multiple onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} disabled={disabled || photos.length >= MAX_PICTURES} className="sr-only" id="smart-add-photos" />
          <label htmlFor="smart-add-photos" className="pressable inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-white/5 px-3 text-xs font-semibold">
            <ImagePlus aria-hidden className="size-4" /> Screenshots ({photos.length}/{MAX_PICTURES})
          </label>
        </div>
        <p className="text-[11px] text-faint">
          {canTalk ? "Talk uses your phone's built-in speech recognition. " : "To talk, tap the microphone on your phone's keyboard. "}
          On a computer you can drag screenshots onto this box.
        </p>

        {photos.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <li key={p.url} className="flex items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:), not a page image */}
                <img src={p.url} alt={`Picture ${i + 1} to send with this request`} className="size-14 rounded-lg object-cover" />
                <button type="button" onClick={() => {
                    URL.revokeObjectURL(p.url);
                    setPhotos((all) => all.filter((x) => x !== p));
                  }} className="pressable inline-flex min-h-11 items-center rounded-xl px-1.5 text-muted" aria-label={`Remove picture ${i + 1}`}>
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {photoError && <p role="alert" className="text-xs text-rose">{photoError}</p>}
        {photos.length > 0 && (
          <p className="rounded-xl border border-amber/30 bg-amber/5 px-3 py-2 text-[11px] text-muted">
            <span className="font-semibold text-amber">About pictures:</span> typed names are swapped for codes before anything is sent, but pictures go to the AI (Anthropic) as they are. Crop out phone numbers, emails and addresses first. Pictures aren&apos;t saved anywhere.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || disabled || (!note.trim() && !photos.length)} className="pressable inline-flex min-h-12 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-violet-deep px-3 text-sm font-semibold disabled:opacity-60">
            <Sparkles aria-hidden className="size-4" />
            {pending ? "Organizing…" : "Organize with AI"}
          </button>
          <button type="button" onClick={() => setManual((m) => !m)} aria-expanded={manual} className="pressable inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-line bg-white/5 px-3 text-sm font-semibold">
            Add without AI
          </button>
        </div>
        {disabled && disabledNote && <p className="text-[11px] text-faint">{disabledNote}</p>}
        {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
      </form>

      {manual && (
        <div className="glass rounded-3xl p-4">
          <p className="mb-2 text-xs text-muted">
            No AI, no cost: your first line becomes the title and the rest become steps. Pick the client and person, then add it.{photos.length ? " Screenshots aren't saved with work orders." : ""}
          </p>
          <WorkOrderForm key={note} clients={clients} staff={staff} today={today} fromDraft aiDraft={false} submitLabel="Add this work order" defaults={fromNote(note)} />
        </div>
      )}

      {state?.drafts && (
        <div className="space-y-2.5" aria-live="polite">
          <p className="px-1 text-sm">{state.drafts.headline || "Here's the outline."}</p>
          {state.drafts.orders.length === 0 && <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No work found in that. Try adding a bit more detail.</p>}
          {state.drafts.orders.map((d, i) => (
            <DraftCard key={`${i}-${d.title}`} d={d} i={i} clients={clients} staff={staff} today={today} />
          ))}
          <p className="px-1 text-[11px] text-faint">
            AI outline: check each one; it can be wrong. Nothing is saved until you Confirm or Add. Leaving this page clears it.
            {state.costUsd !== undefined ? ` Cost: $${state.costUsd.toFixed(3)}.` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function DraftCard({ d, i, clients, staff, today }: { d: WorkOrderDraft; i: number; clients: { slug: string; name: string }[]; staff: { id: string; name: string }[]; today: string }) {
  const [state, confirm, saving] = useActionState(createWorkOrder, undefined);
  const [skipped, setSkipped] = useState(false);
  // The AI can't always tell the client: pick it right here, then Confirm.
  const [slug, setSlug] = useState(d.clientSlug ?? "");
  if (skipped) return null;
  const color = deadlineColor(d.dueOn ?? null, today);
  const canConfirm = Boolean(slug) && !d.contactWarning;
  const defaults = { slug: d.clientSlug ?? undefined, title: d.title, steps: d.steps.join("\n"), priority: d.priority, ownerId: d.assigneeId ?? undefined, est: d.estMinutes, notes: d.why.slice(0, 500), due: d.dueOn ?? undefined };
  return (
    <article className="glass animate-rise-in rounded-3xl p-3.5" style={{ animationDelay: `${i * 60}ms` }}>
      <p className="text-sm font-semibold">{d.title}</p>
      <p className="mt-0.5 text-[11px] text-muted">
        {d.clientName ?? <span className="text-amber">pick the client</span>} · {d.priority === "critical" ? "urgent" : d.priority} · {d.estMinutes ? `~${minutesLabel(d.estMinutes)}` : "no estimate"}
      </p>
      <p className="mt-0.5 text-[11px]">
        {d.assigneeName ? <span className="text-violet">For {d.assigneeName}{d.assigneeWhy ? `: ${d.assigneeWhy}` : ""}</span> : <span className="text-muted">No one suggested</span>}
      </p>
      {d.dueOn && (
        <p className={`mt-0.5 text-[11px] ${DEADLINE_STYLE[color].text}`}>
          Due {d.dueOn} ({deadlineText(d.dueOn, today).toLowerCase()}){d.dueNote ? <span className="text-muted"> · {d.dueNote}</span> : null}
        </p>
      )}
      {d.why && <p className="mt-1 text-xs text-muted">{d.why}</p>}
      {d.steps.length > 0 && (
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs text-muted">
          {d.steps.map((s, j) => (
            <li key={`${j}-${s}`}>{s}</li>
          ))}
        </ol>
      )}
      {d.contactWarning && <p className="mt-1.5 text-[11px] text-amber">This draft looks like it has an email or phone number in it. Use Edit and take it out first.</p>}

      {state?.ok ? (
        <p role="status" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-lime">
          <Check aria-hidden className="size-4" /> Added as a work order
        </p>
      ) : (
        <>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <form action={confirm} className="flex w-full flex-wrap items-center gap-2">
              {Object.entries({ ...defaults, slug: undefined, est: nearestEst(d.estMinutes), fromDraft: "1" }).map(([k, v]) => (v === undefined || v === null || v === "" ? null : <input key={k} type="hidden" name={k} value={String(v)} />))}
              <label className="min-w-0 flex-1">
                <span className="sr-only">Client for this work order</span>
                <select name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} className={`min-h-11 w-full rounded-xl border px-3 text-sm text-ink ${slug ? "border-line bg-white/5" : "border-amber/60 bg-amber/10"}`}>
                  <option value="">Pick the client…</option>
                  {clients.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={!canConfirm || saving} className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-violet-deep px-4 text-sm font-semibold disabled:opacity-50">
                <Check aria-hidden className="size-4" /> {saving ? "Adding…" : "Confirm"}
              </button>
            </form>
            <button type="button" onClick={() => setSkipped(true)} className="pressable min-h-11 rounded-xl border border-line bg-white/5 px-3 text-sm text-muted">
              Skip
            </button>
          </div>
          {!slug && !d.contactWarning && <p className="mt-1 text-[11px] text-amber">Pick the client above to turn on Confirm.</p>}
          {state?.error && <p role="alert" className="mt-1 text-xs text-rose">{state.error}</p>}
          <details className="mt-2">
            <summary className="pressable inline-flex min-h-10 cursor-pointer list-none items-center rounded-xl border border-violet/40 bg-violet/10 px-3 text-xs font-semibold">Edit before adding</summary>
            <div className="mt-2">
              <WorkOrderForm clients={clients} staff={staff} today={today} fromDraft submitLabel="Add this work order" defaults={{ ...defaults, slug: slug || undefined }} />
            </div>
          </details>
        </>
      )}
    </article>
  );
}
