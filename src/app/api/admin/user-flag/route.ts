import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

const bodySchema = z.object({
  user_id: z.string().uuid(),
  blocked: z.boolean(),
});

export async function POST(req: Request) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (r) {
    return r as Response;
  }

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("profiles")
    .update({ blocked: body.data.blocked })
    .eq("id", body.data.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("audit_log").insert({
    user_id: body.data.user_id,
    actor_id: actor.id,
    action: body.data.blocked ? "user_block" : "user_unblock",
    target_type: "user",
    target_id: body.data.user_id,
  });

  return NextResponse.json({ ok: true });
}
