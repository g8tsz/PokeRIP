import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

const bodySchema = z.object({
  user_id: z.string().uuid(),
  amount_cents: z.number().int().refine((n) => n !== 0, "amount_must_be_nonzero"),
  memo: z.string().min(1).max(200),
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
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid_body" }, { status: 400 });
  }

  // Cap absolute amount at $10,000 per adjustment as a safety measure.
  if (Math.abs(body.data.amount_cents) > 1_000_000) {
    return NextResponse.json({ error: "amount_exceeds_admin_cap" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("adjust_wallet", {
    p_user_id: body.data.user_id,
    p_amount_cents: body.data.amount_cents,
    p_memo: body.data.memo,
    p_actor_id: actor.id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, balance_after_cents: data });
}
