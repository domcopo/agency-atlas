// Kit (0014): the team handbook. Pure functions (no database, no network), tested in
// tests/fixtures.test.ts. Page text is plain text with a few simple marks:
//   "# " heading, "## " smaller heading, "- " bullet, "1. " numbered step,
//   **bold**, and [link text](https://...). Nothing else is interpreted, so pasted text
//   can never run code: it is shown as plain text.

export type KitKind = "readme" | "sop" | "faq" | "template";
export type KitAudience = "manager" | "developer";

export interface KitDoc {
  id: string;
  kind: KitKind;
  title: string;
  category: string | null;
  body: string;
  audience: KitAudience[];
  reviewedOn: string | null;
  archived: boolean;
  updatedAt: string;
}

export interface KitVersion {
  id: string;
  title: string;
  body: string;
  savedAt: string;
  savedBy: string | null;
}

export interface KitTool {
  id: string;
  name: string;
  purpose: string | null;
  url: string | null;
  loginWhere: string | null;
  managerId: string | null;
  accessNote: string | null;
  monthlyUsd: number | null;
  renewsOn: string | null;
  forDevelopers: boolean;
  archived: boolean;
}

/** What developers see of a tool (the team_tools view). */
export type TeamTool = Pick<KitTool, "id" | "name" | "purpose" | "url" | "loginWhere">;

export const KIT_KINDS: { kind: KitKind; label: string; plural: string }[] = [
  { kind: "readme", label: "Start here", plural: "Start here" },
  { kind: "sop", label: "SOP", plural: "SOPs" },
  { kind: "faq", label: "FAQ", plural: "FAQ" },
  { kind: "template", label: "Template", plural: "Templates" },
];
export const kitKindLabel = (k: KitKind) => KIT_KINDS.find((x) => x.kind === k)?.label ?? k;

export const KIT_RULES = {
  /** An SOP not reviewed in this many days is flagged "needs a review". */
  reviewEveryDays: 90,
  /** Tools renewing within this many days are flagged. */
  renewSoonDays: 14,
} as const;

/**
 * Text that looks like a password or key. Kit must never hold one (the database refuses
 * these too). Returns a plain reason, or null if it looks fine.
 */
export function findSecrets(text: string): string | null {
  if (/(password|passcode|passwd|pwd)\s*[:=]\s*\S/i.test(text)) return "It looks like it contains a password. Say where the login is kept instead (e.g. \"in the team password manager\").";
  if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) return "It looks like it contains an API key. Keys never go in Atlas.";
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return "It looks like it contains a private key. Keys never go in Atlas.";
  return null;
}

/** SOPs (and the README) should be checked now and then; null = fine. */
export function reviewNote(d: Pick<KitDoc, "kind" | "reviewedOn" | "updatedAt">, today: string): string | null {
  if (d.kind !== "sop" && d.kind !== "readme") return null;
  const last = d.reviewedOn ?? d.updatedAt.slice(0, 10);
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000);
  return days > KIT_RULES.reviewEveryDays ? `Not reviewed in ${days} days` : null;
}

/** Days until a tool renews (negative = already past), or null. */
export function renewsIn(t: Pick<KitTool, "renewsOn">, today: string): number | null {
  if (!t.renewsOn) return null;
  return Math.round((Date.parse(`${t.renewsOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Simple search over titles, categories and text (case-insensitive, every word must match). */
export function searchKit(docs: KitDoc[], q: string): KitDoc[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return docs;
  return docs.filter((d) => {
    const hay = `${d.title} ${d.category ?? ""} ${d.body}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// ---------------------------------------------------------------------------
// Page text → blocks for safe display (rendered as React elements, never as HTML).
// ---------------------------------------------------------------------------

export type Inline = { t: "text"; v: string } | { t: "bold"; v: string } | { t: "link"; v: string; href: string };
export type Block =
  | { t: "h1" | "h2" | "p"; parts: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] };

/** **bold** and [text](https://link). Only https links; anything else stays plain text. */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]{1,200})\]\((https:\/\/[^\s<>()"]{1,500})\)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index! > last) out.push({ t: "text", v: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else out.push({ t: "link", v: m[2]!, href: m[3]! });
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push({ t: "text", v: line.slice(last) });
  return out;
}

export function parseKitText(body: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", parts: parseInline(para.join(" ")) });
    para = [];
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.+)$/.exec(line);
    const ol = /^\s*\d{1,3}[.)]\s+(.+)$/.exec(line);
    if (!line.trim()) {
      flush();
    } else if (h) {
      flush();
      blocks.push({ t: h[1] === "#" ? "h1" : "h2", parts: parseInline(h[2]!) });
    } else if (ul || ol) {
      flush();
      const t = ul ? "ul" : "ol";
      const item = parseInline((ul ?? ol)![1]!);
      const prev = blocks.at(-1);
      if (prev && prev.t === t) prev.items.push(item);
      else blocks.push({ t, items: [item] });
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** Text to copy (templates): the page text without the formatting marks. */
export function plainText(body: string): string {
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^#{1,3}\s+/, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, "$1 ($2)"))
    .join("\n")
    .trim();
}
