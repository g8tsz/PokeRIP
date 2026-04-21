/**
 * Geo- and age-gate configuration shared by edge middleware and
 * server-side API guards. Keep this file edge-safe (no node imports).
 */

export const ALLOWED_COUNTRIES = (process.env.ALLOWED_COUNTRIES ?? "US")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

export const BLOCKED_US_STATES = (process.env.BLOCKED_US_STATES ?? "")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

/** Page paths that require geo + age verification. */
export const GATED_PATHS: RegExp[] = [
  /^\/play/,
  /^\/packs\/.+\/open/,
  /^\/wallet/,
  /^\/inventory/,
  /^\/payouts/,
];

export type GeoCheck =
  | { allowed: true }
  | { allowed: false; reason: "country" | "state"; country: string; region: string };

export function checkGeo(country: string, region: string): GeoCheck {
  const c = country.toUpperCase();
  const r = region.toUpperCase();
  if (!ALLOWED_COUNTRIES.includes(c)) return { allowed: false, reason: "country", country: c, region: r };
  if (c === "US" && BLOCKED_US_STATES.includes(r)) return { allowed: false, reason: "state", country: c, region: r };
  return { allowed: true };
}
