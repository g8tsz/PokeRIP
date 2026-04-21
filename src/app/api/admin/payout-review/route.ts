import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

const bodySchema = z.object({
  payout_id: z.string().uuid(),
  action: z.enum(["cancel"]),
  reason: z.string().max(200).optional(),
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
  if (body.data.action === "cancel") {
    const { error } = await admin.rpc("admin_cancel_payout", {
      p_payout_id: body.data.payout_id,
      p_actor_id: actor.id,
      p_reason: body.data.reason ?? "Canceled by admin",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
