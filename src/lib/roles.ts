// Who is who in Atlas. The database is the real lock (each role sees only what its
// security rules allow); these helpers only decide which screens and buttons to show.

export type MemberRole = "owner" | "manager" | "developer" | "sales";

export const MEMBER_ROLES: readonly MemberRole[] = ["owner", "manager", "developer", "sales"];

/** Reads a role from the database; anything unknown becomes null (shown nothing extra). */
export function asMemberRole(v: unknown): MemberRole | null {
  return MEMBER_ROLES.includes(v as MemberRole) ? (v as MemberRole) : null;
}

/** The owner and managers: the full app (clients, work, growth…). */
export function isLead(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/** Salespeople: Home (their plan), Sales and Kit. */
export function isSales(role: string | null | undefined): boolean {
  return role === "sales";
}
