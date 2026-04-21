import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ensureProfileAndWallet } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supa = await createSupabaseServer();
  const { data } = await supa.auth.getUser();
  if (!data.user) return NextResponse.json({ ok: false }, { status: 401 });
  await ensureProfileAndWallet(data.user.id, data.user.email ?? "");
  return NextResponse.json({ ok: true });
}
