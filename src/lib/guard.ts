import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { checkGeo } from "@/lib/gating";

/**
 * Server-side gate for money-moving API routes.
 *
 * Mirrors the edge middleware so a blocked user / underage visitor / restricted
 * region cannot bypass the gate by calling the API directly. Always use this
 * (or `requireAdmin`) on any endpoint that spends, pays out, ships, or sells.
 */

export type GateResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

export type GuardOptions = {
  /** Skip the geo check (e.g. read-only player endpoints). Default: false. */
  skipGeo?: boolean;
  /** Skip the age-verified cookie check. Default: false. */
  skipAge?: boolean;
};

export async function guardPlayer(opts: GuardOptions = {}): Promise<GateResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  // 1. Account status — admins can flag users and they must be immediately locked out.
  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("blocked, blocked_reason")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.blocked) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "account_suspended", reason: profile.blocked_reason ?? null },
        { status: 403 },
      ),
    };
  }

  // 2. Geo — read Vercel IP headers. In local dev, default to US/empty state so
  //    developers aren't blocked.
  if (!opts.skipGeo) {
    const hs = await headers();
    const country = hs.get("x-vercel-ip-country") ?? "US";
    const region = hs.get("x-vercel-ip-country-region") ?? "";
    const geo = checkGeo(country, region);
    if (!geo.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "geo_blocked", reason: geo.reason, country: geo.country, region: geo.region },
          { status: 451 },
        ),
      };
    }
  }

  // 3. Age-gate cookie. This is set after the user confirms on /age-gate.
  if (!opts.skipAge) {
    const ck = await cookies();
    if (ck.get("age-verified")?.value !== "1") {
      return {
        ok: false,
        response: NextResponse.json({ error: "age_not_verified" }, { status: 403 }),
      };
    }
  }

  return { ok: true, user };
}
