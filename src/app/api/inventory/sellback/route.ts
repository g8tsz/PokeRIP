import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELLBACK_RATE = 0.7; // house keeps 30%

const bodySchema = z.object({
  unit_ids: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: units } = await admin
    .from("card_units")
    .select("id, owned_by_user, state, card:cards(market_value_cents)")
    .in("id", parsed.data.unit_ids);

  if (!units) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let totalPayout = 0;
  for (const u of (units as unknown) as Array<{
    id: string;
    owned_by_user: string;
    state: string;
    card: { market_value_cents: number };
  }>) {
    if (u.owned_by_user !== user.id || u.state !== "held") continue;
    const payout = Math.floor(u.card.market_value_cents * SELLBACK_RATE);
    const { error } = await admin.rpc("sellback_card", {
      p_user_id: user.id,
      p_unit_id: u.id,
      p_payout_cents: payout,
    });
    if (!error) totalPayout += payout;
  }

  return NextResponse.json({ ok: true, total_credited_cents: totalPayout });
}
