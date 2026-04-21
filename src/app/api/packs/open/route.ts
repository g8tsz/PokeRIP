import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import {
  computeRoll,
  newServerSeed,
  pickWeighted,
  type WeightedReward,
} from "@/lib/rng";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  pack_id: z.string().uuid(),
  client_seed: z.string().min(1).max(128).optional(),
});

type RewardRow = {
  id: string;
  card_id: string;
  weight: number;
  max_supply: number | null;
  awarded_count: number;
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { pack_id, client_seed } = parsed.data;

  const admin = createSupabaseAdmin();

  // 1. Load pack + rewards.
  const { data: pack, error: packErr } = await admin
    .from("packs")
    .select("id, price_cents, active")
    .eq("id", pack_id)
    .maybeSingle();
  if (packErr || !pack || !pack.active) {
    return NextResponse.json({ error: "pack_not_found" }, { status: 404 });
  }

  const { data: rewardsRaw } = await admin
    .from("pack_rewards")
    .select("id, card_id, weight, max_supply, awarded_count")
    .eq("pack_id", pack_id);

  const rewards = (rewardsRaw as RewardRow[] | null) ?? [];
  if (rewards.length === 0) {
    return NextResponse.json({ error: "pack_empty" }, { status: 400 });
  }

  // 2. Get or create an active server seed for this user.
  const { data: existingSeed } = await admin
    .from("server_seeds")
    .select("id, seed_hash, seed_plain, nonce")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let seedId: string;
  let seedPlain: string;
  let seedHash: string;
  let nonce: number;

  if (existingSeed) {
    seedId = existingSeed.id;
    seedPlain = existingSeed.seed_plain as string;
    seedHash = existingSeed.seed_hash as string;
    nonce = existingSeed.nonce as number;
  } else {
    const fresh = newServerSeed();
    const { data: inserted, error: insertErr } = await admin
      .from("server_seeds")
      .insert({
        user_id: user.id,
        seed_hash: fresh.hash,
        seed_plain: fresh.plain,
        nonce: 0,
        active: true,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      return NextResponse.json({ error: "seed_create_failed" }, { status: 500 });
    }
    seedId = inserted.id;
    seedPlain = fresh.plain;
    seedHash = fresh.hash;
    nonce = 0;
  }

  const clientSeed = client_seed || `default-${user.id.slice(0, 8)}`;

  // 3. Compute the roll + pick a reward.
  const roll = computeRoll(seedPlain, clientSeed, nonce);
  const weighted: WeightedReward<RewardRow>[] = rewards.map((r) => ({
    item: r,
    weight: r.weight,
    remaining: r.max_supply === null ? null : r.max_supply - r.awarded_count,
  }));

  const picked = pickWeighted(weighted, roll.value);

  // 4. Commit via RPC (atomic wallet debit + inventory assign + ledger + opening).
  const { data: rpcData, error: rpcErr } = await admin.rpc("open_pack", {
    p_user_id: user.id,
    p_pack_id: pack_id,
    p_price_cents: pack.price_cents,
    p_reward_id: picked.item.id,
    p_server_seed_id: seedId,
    p_server_seed_hash: seedHash,
    p_client_seed: clientSeed,
    p_nonce: nonce,
    p_roll_hash: roll.hash,
    p_roll_value: roll.value,
  });

  if (rpcErr) {
    const msg = rpcErr.message || "open_failed";
    const status = /insufficient_funds/.test(msg)
      ? 402
      : /sold_out|not_found|empty/.test(msg)
        ? 409
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  // 5. Fetch the card details for the response.
  const { data: card } = await admin
    .from("cards")
    .select("id, name, rarity, image_url, set_name, market_value_cents")
    .eq("id", result.card_id)
    .single();

  return NextResponse.json({
    opening_id: result.opening_id,
    card,
    payout_value_cents: result.payout_value_cents,
    balance_after_cents: result.balance_after_cents,
    provably_fair: {
      server_seed_hash: seedHash,
      client_seed: clientSeed,
      nonce,
      roll_hash: roll.hash,
      roll_value: roll.value,
      // seed_plain is deliberately omitted until rotation/reveal
    },
    // Pool of possible outcomes (for the reel animation), sorted by weight
    rewards_preview: rewards
      .map((r) => ({ id: r.id, card_id: r.card_id, weight: r.weight }))
      .sort((a, b) => a.weight - b.weight),
  });
}
