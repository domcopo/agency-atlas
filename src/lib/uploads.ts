// Smart add uploads: plain checks on files the phone sends (pure, tested).
// Files are checked by their first bytes (the name and the browser's label can lie),
// sent to the AI once, and never saved.

/** One PDF per Smart add. Vercel refuses requests over 4.5 MB, so this leaves room. */
export const MAX_PDF_BYTES = 3_500_000;
/** Pictures + PDF together (the server's request limit is 4 MB, next.config). */
export const MAX_UPLOAD_TOTAL_BYTES = 3_900_000;

/** A real PDF starts with "%PDF-". */
export function isPdf(b: Uint8Array): boolean {
  return b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
}
