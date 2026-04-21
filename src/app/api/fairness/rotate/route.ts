import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { newServerSeed } from "@/lib/rng";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createSupabaseAdmin();

  // Reveal and deactivate the current active seed, then create a new one.
  await admin
    .from("server_seeds")
    .update({ active: false, revealed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("active", true);

  const fresh = newServerSeed();
  const { data } = await admin
    .from("server_seeds")
    .insert({
      user_id: user.id,
      seed_hash: fresh.hash,
      seed_plain: fresh.plain,
      nonce: 0,
      active: true,
    })
    .select("id, seed_hash")
    .single();

  return NextResponse.json({ ok: true, new_seed_hash: data?.seed_hash });
}
