// Cash home buyers / real estate investors ("we buy houses"): detected from the niche and
// services, and the owner's money playbook for them. Pure, no imports (used by intake and depth).

const HOME_BUYER = /\b(we buy (houses|homes)|buys? (houses|homes)|sell my (house|home)|cash (home|house)s? buyers?|(home|house) buyers?|sell (my )?(house|home) fast)\b/;

/** A cash home buyer / real estate investor ("we buy houses"): deal-based money model. */
export function isHomeBuyer(niche: string, services: string[]): boolean {
  return [niche, ...services].some((x) => HOME_BUYER.test(x.toLowerCase()) || /\breal estate invest/.test(x.toLowerCase()));
}

/**
 * The owner's playbook for home buyers (docs/seo-audit-reference, 2026-11-28): about $20,000
 * gross per closed deal, 4% of visits become leads, and roughly 12% of leads close
 * (15% contract × 80% close) → about 0.5% of visits become deals. Suggestions only: every
 * figure is labeled "assumption" until the client confirms it.
 */
export const HOME_BUYER_PRESET = { avgDealUsd: 20_000, visitToLeadRate: 0.04, visitToDealRate: 0.005 } as const;
