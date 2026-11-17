// "Our agency" (0022): work orders for the agency itself (our marketing, website, admin),
// with no client and no lead. Pure helpers, safe in browser and server code.

/** The client picker's value for internal work. Not a real slug (real ones are a-z, 0-9, -). */
export const AGENCY_SLUG = "_agency";
/** How internal work is labelled everywhere a client name would go. */
export const AGENCY_LABEL = "Our agency (internal)";
/** The code the AI uses for internal work in Smart add. */
export const AGENCY_AI_CODE = "AGENCY";

/** The client name to show for an item: the client, "Our agency (internal)", or the fallback. */
export function clientLabel(a: { client: { name: string } | null; internal?: boolean }, none = "No client"): string {
  if (a.client) return a.client.name;
  return a.internal ? AGENCY_LABEL : none;
}
