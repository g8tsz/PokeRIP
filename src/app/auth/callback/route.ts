import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ensureProfileAndWallet } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supa = await createSupabaseServer();
    const { data, error } = await supa.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await ensureProfileAndWallet(data.user.id, data.user.email ?? "");
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
