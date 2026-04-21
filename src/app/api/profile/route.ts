import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  display_name: z.string().min(1).max(40).nullable(),
  handle: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/, "Handle must be 3-20 chars: a-z, 0-9, _")
    .nullable(),
  public_profile: z.boolean(),
});

const RESERVED = new Set([
  "admin",
  "api",
  "auth",
  "dashboard",
  "fairness",
  "inventory",
  "login",
  "signup",
  "packs",
  "payouts",
  "shipping",
  "terms",
  "u",
  "unavailable",
  "wallet",
]);

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad_request" }, { status: 400 });
  }
  const { display_name, handle, public_profile } = parsed.data;

  if (handle && RESERVED.has(handle)) {
    return NextResponse.json({ error: "handle_reserved" }, { status: 409 });
  }

  const admin = createSupabaseAdmin();

  // Uniqueness check for handle (DB also enforces it, but give a nicer error).
  if (handle) {
    const { data: clash } = await admin
      .from("profiles")
      .select("id")
      .eq("handle", handle)
      .neq("id", user.id)
      .maybeSingle();
    if (clash) {
      return NextResponse.json({ error: "handle_taken" }, { status: 409 });
    }
  }

  if (public_profile && !handle) {
    return NextResponse.json(
      { error: "Public profile requires a handle." },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("profiles")
    .update({ display_name, handle, public_profile, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
