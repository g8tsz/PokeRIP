import { NextRequest, NextResponse } from "next/server";

/**
 * Edge middleware:
 *   1. Refresh Supabase session cookie on navigations.
 *   2. Block traffic from disallowed countries / US states (Vercel geo headers).
 *   3. Enforce age-gate cookie on gameplay routes.
 *
 * We intentionally keep the Supabase cookie refresh inline (no external import)
 * to keep the middleware bundle lean on the edge.
 */

const ALLOWED_COUNTRIES = (process.env.ALLOWED_COUNTRIES ?? "US")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const BLOCKED_US_STATES = (process.env.BLOCKED_US_STATES ?? "")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const GATED_PATHS = [/^\/play/, /^\/packs\/.+\/open/, /^\/wallet/, /^\/inventory/, /^\/payouts/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Vercel-provided geo headers (fall back gracefully in dev).
  const country = (req.headers.get("x-vercel-ip-country") ?? "US").toUpperCase();
  const region = (req.headers.get("x-vercel-ip-country-region") ?? "").toUpperCase();

  const isGated = GATED_PATHS.some((re) => re.test(pathname));

  if (isGated) {
    if (!ALLOWED_COUNTRIES.includes(country)) {
      return NextResponse.redirect(new URL("/unavailable?reason=country", req.url));
    }
    if (country === "US" && BLOCKED_US_STATES.includes(region)) {
      return NextResponse.redirect(new URL("/unavailable?reason=state", req.url));
    }
    const ageOk = req.cookies.get("age-verified")?.value === "1";
    if (!ageOk) {
      const url = new URL("/age-gate", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api/webhook|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
