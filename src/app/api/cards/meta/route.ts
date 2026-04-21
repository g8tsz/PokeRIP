import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  if (!idsParam) return NextResponse.json({ cards: [] });
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (ids.length === 0) return NextResponse.json({ cards: [] });

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("cards")
    .select("id, name, rarity, image_url, set_name, market_value_cents")
    .in("id", ids);

  return NextResponse.json({ cards: data ?? [] });
}
