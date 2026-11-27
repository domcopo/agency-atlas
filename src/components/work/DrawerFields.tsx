"use client";

// Work hub drawer fields (Phase 2, docs/WORK_HUB_PLAN.md): each field saves on its own
// when you leave it (or right away for a pick list), only if the value changed, and says
// "Saving…", "Saved" or what went wrong. They call the same server actions as the forms
// elsewhere (saveActionField = updateAction with an answer, editActionText,
// saveWorkOrderInfo, saveActualHours); the server re-checks who you are and the database
// has the final say.

import { useEffect, useRef, useState, useTransition } from "react";
import { editActionText, saveActionField, saveActualHours, saveWorkOrderInfo } from "@/app/actions";
import { cn } from "@/lib/format";
import { contactDetailsIn } from "@/lib/work-orders";

type Result = { error?: string; ok?: boolean } | undefined;
type Action = (prev: Result, fd: FormData) => Promise<Result>;

export const fieldCls = "min-h-10 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink disabled:opacity-60";
const labelCls = "block text-xs font-semibold text-muted";

/** Runs a save and remembers how it went, for the little note under a field. */
function useSave(action: Action) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const run = (fields: Record<string, string>, onDone?: (ok: boolean) => void) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    start(async () => {
      let r: Result;
      try {
        r = await action(undefined, fd);
      } catch {
        r = { error: "Couldn't save. Check your connection and try again." };
      }
      if (r?.error) {
        setState("error");
        setError(r.error);
        onDone?.(false);
      } else {
        setState("saved");
        setError("");
        onDone?.(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 2500);
      }
    });
  };
  const note = pending ? (
    <span role="status" className="text-xs text-muted">
      Saving…
    </span>
  ) : state === "saved" ? (
    <span role="status" className="text-xs text-lime">
      Saved
    </span>
  ) : state === "error" ? (
    <span role="alert" className="text-xs text-rose">
      {error}
    </span>
  ) : null;
  return { run, pending, note };
}

function Label({ text, note, htmlFor }: { text: string; note: React.ReactNode; htmlFor?: string }) {
  return (
    <span className="mb-1 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className={labelCls}>
        {text}
      </label>
      {note}
    </span>
  );
}

/** Title and notes, saved together when you leave either box. */
export function TitleNotesField({ id, title, notes, disabled, workOrder }: { id: string; title: string; notes: string | null; disabled?: boolean; workOrder: boolean }) {
  const { run, note } = useSave(editActionText);
  const [t, setT] = useState(title);
  const [n, setN] = useState(notes ?? "");
  const saved = useRef({ t: title, n: notes ?? "" });
  const contact = workOrder ? contactDetailsIn(`${t}\n${n}`) : [];
  const save = () => {
    if (!t.trim()) return;
    if (t === saved.current.t && n === saved.current.n) return;
    const next = { t, n };
    run({ actionId: id, title: t, notes: n }, (ok) => {
      if (ok) saved.current = next;
    });
  };
  return (
    <div className="space-y-2">
      <div>
        <Label text="Title" note={note} htmlFor={`title-${id}`} />
        <input id={`title-${id}`} value={t} maxLength={120} required disabled={disabled} onChange={(e) => setT(e.target.value)} onBlur={save} className={cn(fieldCls, "font-semibold")} />
      </div>
      <div>
        <label htmlFor={`notes-${id}`} className={cn(labelCls, "mb-1")}>
          Notes
        </label>
        <textarea id={`notes-${id}`} value={n} rows={3} maxLength={500} disabled={disabled} onChange={(e) => setN(e.target.value)} onBlur={save} placeholder="What needs doing, in a sentence or two" className={cn(fieldCls, "py-2")} />
      </div>
      {contact.length > 0 && <p className="rounded-lg border border-amber/40 bg-amber/10 px-2 py-1 text-xs text-amber">This looks like {contact.join(" and ")}. Keep contact details in the client record, not in work orders.</p>}
    </div>
  );
}

/** A pick list (owner, priority, estimate) that saves as soon as you pick. */
export function PickField({ id, op, name, label, value, options, disabled }: { id: string; op: string; name: string; label: string; value: string; options: { value: string; label: string }[]; disabled?: boolean }) {
  const { run, note, pending } = useSave(saveActionField);
  const [v, setV] = useState(value);
  const fid = `${op}-${id}`;
  return (
    <div>
      <Label text={label} note={note} htmlFor={fid} />
      <select
        id={fid}
        value={v}
        disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.value;
          const before = v;
          setV(next);
          run({ actionId: id, op, [name]: next }, (ok) => !ok && setV(before));
        }}
        className={fieldCls}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A date that saves once a full date is picked (or cleared, when clearing is allowed). */
export function DateField({ id, op, name, label, value, allowEmpty = false, max, disabled }: { id: string; op: string; name: string; label: string; value: string | null; allowEmpty?: boolean; max?: string; disabled?: boolean }) {
  const { run, note } = useSave(saveActionField);
  const [v, setV] = useState(value ?? "");
  const saved = useRef(value ?? "");
  const fid = `${op}-${id}`;
  const save = (next: string) => {
    if (next === saved.current) return;
    if (!next && !allowEmpty) return;
    if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    run({ actionId: id, op, [name]: next }, (ok) => {
      if (ok) saved.current = next;
    });
  };
  return (
    <div>
      <Label text={label} note={note} htmlFor={fid} />
      <input
        id={fid}
        type="date"
        value={v}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          setV(e.target.value);
          save(e.target.value);
        }}
        className={fieldCls}
      />
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "open", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting", label: "Waiting on client" },
  { value: "blocked", label: "Blocked" },
  { value: "review", label: "In review" },
  { value: "done", label: "Done" },
];

/** Status, and what it's blocked on when it's blocked (saved when you leave the box). */
export function StatusField({ id, status, reason, disabled }: { id: string; status: string; reason: string | null; disabled?: boolean }) {
  const { run, note, pending } = useSave(saveActionField);
  const [s, setS] = useState(status);
  const [r, setR] = useState(reason ?? "");
  const savedReason = useRef(reason ?? "");
  const fid = `status-${id}`;
  return (
    <div className="space-y-2">
      <div>
        <Label text="Status" note={note} htmlFor={fid} />
        <select
          id={fid}
          value={s}
          disabled={disabled || pending}
          onChange={(e) => {
            const next = e.target.value;
            const before = s;
            setS(next);
            run({ actionId: id, op: "status", status: next, reason: next === "blocked" ? r : "" }, (ok) => !ok && setS(before));
          }}
          className={cn(fieldCls, s === "blocked" && "border-rose/50 text-rose")}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {s === "blocked" && (
        <div>
          <label htmlFor={`reason-${id}`} className={cn(labelCls, "mb-1")}>
            Blocked on
          </label>
          <input
            id={`reason-${id}`}
            value={r}
            maxLength={200}
            disabled={disabled}
            placeholder="Blocked on what? (so someone can help)"
            onChange={(e) => setR(e.target.value)}
            onBlur={() => {
              if (r === savedReason.current) return;
              run({ actionId: id, op: "status", status: "blocked", reason: r }, (ok) => {
                if (ok) savedReason.current = r;
              });
            }}
            className={cn(fieldCls, "border-rose/40")}
          />
        </div>
      )}
    </div>
  );
}

/** The steps, one per line (the checklist above ticks them). Saved when you leave the box. */
export function StepsField({ id, steps, disabled }: { id: string; steps: string; disabled?: boolean }) {
  const { run, note } = useSave(saveActionField);
  const [v, setV] = useState(steps);
  const saved = useRef(steps);
  return (
    <div>
      <Label text="Edit steps (one per line)" note={note} htmlFor={`steps-${id}`} />
      <textarea
        id={`steps-${id}`}
        value={v}
        rows={4}
        maxLength={2000}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v === saved.current) return;
          run({ actionId: id, op: "steps", steps: v }, (ok) => {
            if (ok) saved.current = v;
          });
        }}
        placeholder="One step per line"
        className={cn(fieldCls, "py-2")}
      />
    </div>
  );
}

/** "Done when" (0038): one line on what finished looks like. Saved when you leave the box. */
export function DoneWhenField({ id, value, disabled }: { id: string; value: string | null; disabled?: boolean }) {
  const { run, note } = useSave(saveActionField);
  const [v, setV] = useState(value ?? "");
  const saved = useRef(value ?? "");
  return (
    <div>
      <Label text="Done when" note={note} htmlFor={`donewhen-${id}`} />
      <textarea
        id={`donewhen-${id}`}
        value={v}
        rows={2}
        maxLength={500}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const next = v.trim();
          if (next === saved.current.trim()) return;
          run({ actionId: id, op: "done_when", doneWhen: next }, (ok) => {
            if (ok) saved.current = next;
          });
        }}
        placeholder="e.g. The form sends to the client's inbox and shows a thank-you page"
        className={cn(fieldCls, "py-2")}
      />
    </div>
  );
}

/** The GoHighLevel conversation link it came from, and a short note. Saved when you leave either box. */
export function GhlLinkField({ id, link, linkNote, disabled }: { id: string; link: string | null; linkNote: string | null; disabled?: boolean }) {
  const { run, note } = useSave(saveActionField);
  const [l, setL] = useState(link ?? "");
  const [n, setN] = useState(linkNote ?? "");
  const saved = useRef({ l: link ?? "", n: linkNote ?? "" });
  const save = () => {
    if (l === saved.current.l && n === saved.current.n) return;
    const next = { l, n };
    run({ actionId: id, op: "ghl", link: l.trim(), linkNote: n }, (ok) => {
      if (ok) saved.current = next;
    });
  };
  return (
    <div className="space-y-2">
      <Label text="GoHighLevel link" note={note} htmlFor={`ghl-${id}`} />
      <input id={`ghl-${id}`} type="url" value={l} maxLength={500} disabled={disabled} placeholder="https://… conversation link" onChange={(e) => setL(e.target.value)} onBlur={save} className={fieldCls} />
      <input value={n} maxLength={200} disabled={disabled} aria-label="Where it came from" placeholder="Where it came from (optional)" onChange={(e) => setN(e.target.value)} onBlur={save} className={fieldCls} />
    </div>
  );
}

/** Start date and other links (0017). Saved together when you leave either. */
export function StartLinksField({ id, start, links, due, disabled }: { id: string; start: string | null; links: string[]; due: string | null; disabled?: boolean }) {
  const { run, note } = useSave(saveWorkOrderInfo);
  const [s, setS] = useState(start ?? "");
  const [l, setL] = useState(links.join("\n"));
  const saved = useRef({ s: start ?? "", l: links.join("\n") });
  const save = (nextS = s, nextL = l) => {
    if (nextS === saved.current.s && nextL === saved.current.l) return;
    if (nextS && !/^\d{4}-\d{2}-\d{2}$/.test(nextS)) return;
    run({ actionId: id, start: nextS, links: nextL }, (ok) => {
      if (ok) saved.current = { s: nextS, l: nextL };
    });
  };
  return (
    <div className="space-y-2">
      <div>
        <Label text="Start date" note={note} htmlFor={`start-${id}`} />
        <input
          id={`start-${id}`}
          type="date"
          value={s}
          max={due ?? undefined}
          disabled={disabled}
          onChange={(e) => {
            setS(e.target.value);
            save(e.target.value, l);
          }}
          className={fieldCls}
        />
      </div>
      <div>
        <label htmlFor={`links-${id}`} className={cn(labelCls, "mb-1")}>
          Links & files (Figma, site, docs): one per line, up to 5, https only
        </label>
        <textarea id={`links-${id}`} value={l} rows={3} disabled={disabled} onChange={(e) => setL(e.target.value)} onBlur={() => save()} placeholder="https://" className={cn(fieldCls, "py-2")} />
      </div>
    </div>
  );
}

/** Actual hours spent. Saved when you leave the box. */
export function HoursField({ id, minutes, disabled }: { id: string; minutes: number | null; disabled?: boolean }) {
  const { run, note } = useSave(saveActualHours);
  const initial = minutes === null ? "" : String(Math.round((minutes / 60) * 10) / 10);
  const [v, setV] = useState(initial);
  const saved = useRef(initial);
  return (
    <div>
      <Label text="Actual hours" note={note} htmlFor={`hours-${id}`} />
      <input
        id={`hours-${id}`}
        inputMode="decimal"
        value={v}
        disabled={disabled}
        placeholder="e.g. 1.5"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v === saved.current) return;
          run({ actionId: id, hours: v }, (ok) => {
            if (ok) saved.current = v;
          });
        }}
        className={fieldCls}
      />
    </div>
  );
}
