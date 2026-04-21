import { NextRequest, NextResponse } from "next/server";
import { GATED_PATHS, checkGeo } from "@/lib/gating";

/**
 * Edge middleware:
 *   1. Block traffic from disallowed countries / US states (Vercel geo headers).
 *   2. Enforce age-gate cookie on gameplay routes.
 *
 * Server-side API routes independently enforce the same gates via
 * `guardPlayer` in `src/lib/guard.ts` so they cannot be bypassed by
 * calling the API directly.
 */

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const country = req.headers.get("x-vercel-ip-country") ?? "US";
  const region = req.headers.get("x-vercel-ip-country-region") ?? "";

  const isGated = GATED_PATHS.some((re) => re.test(pathname));

  if (isGated) {
    const geo = checkGeo(country, region);
    if (!geo.allowed) {
      const url = new URL(`/unavailable?reason=${geo.reason}`, req.url);
      return NextResponse.redirect(url);
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
