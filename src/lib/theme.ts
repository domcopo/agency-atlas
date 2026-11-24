// Light or dark look, picked with the switch in the side menu (computers only). Saved in a
// plain cookie so the page arrives already in the right colors (no flash). It's a display
// preference only: no personal data, and nothing on the server depends on it.

export type Theme = "dark" | "light";

export const THEME_COOKIE = "theme";

/** Anything other than exactly "light" means the normal dark look. */
export function parseTheme(value: string | undefined | null): Theme {
  return value === "light" ? "light" : "dark";
}
