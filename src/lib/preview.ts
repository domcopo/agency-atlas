// "Preview as developer" (approved 2026-11-10, docs/DEVELOPER_VIEW_PLAN.md).
// The owner or a manager can look at Atlas the way one developer sees it.
//
// Rules:
// - LOOK ONLY. While previewing, every save in src/app/actions.ts refuses (guardrail test).
// - The cookie only ever shows LESS: it never grants anything. Every page re-checks that
//   the signed-in person is the owner or a manager and that the person exists; otherwise
//   the cookie is ignored. The database's own rules are unchanged.
// - It is not signing in as someone else: no admin key, no password, no impersonation.
//
// Pure constants and checks (no database, no cookies here), so proxy.ts can import it.

export const PREVIEW_COOKIE = "atlas_preview";
/** The preview turns itself off after this long. */
export const PREVIEW_MINUTES = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A preview cookie value is a team member id and nothing else. */
export function previewTarget(value: string | undefined | null): string | null {
  return value && UUID.test(value) ? value : null;
}

/** Only the owner and managers can preview (they can already see everything shown). */
export function canPreview(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/** While previewing, only the developer's screens open; anything else goes back to Home. */
export function previewAllows(path: string): boolean {
  return path === "/" || path === "/work" || path === "/kit" || /^\/kit\/[0-9a-f-]{36}$/.test(path) || path === "/login" || path === "/mfa";
}
