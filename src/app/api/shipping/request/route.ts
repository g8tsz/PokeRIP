import { NextResponse } from "next/server";
import { z } from "zod";
import { guardPlayer } from "@/lib/guard";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  unit_ids: z.array(z.string().uuid()).min(1).max(100),
  address_id: z.string().uuid().nullable(),
  new_address: z
    .object({
      name: z.string().min(1),
      line1: z.string().min(1),
      line2: z.string().nullable().optional(),
      city: z.string().min(1),
      region: z.string().min(2).max(3),
      postal_code: z.string().min(3),
      country: z.string().default("US"),
    })
    .nullable(),
});

function estimateShipping(totalValueCents: number): number {
  if (totalValueCents >= 50000) return 2500;
  if (totalValueCents >= 10000) return 800;
  return 400;
}

export async function POST(req: Request) {
  const gate = await guardPlayer();
  if (!gate.ok) return gate.response;
  const { user } = gate;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { unit_ids, address_id, new_address } = parsed.data;

  const admin = createSupabaseAdmin();

  // Pre-fetch units JUST to estimate the fee. The RPC locks and revalidates
  // them inside the transaction so this is safe to race against.
  const { data: units } = await admin
    .from("card_units")
    .select("id, owned_by_user, state, card:cards(market_value_cents)")
    .in("id", unit_ids);

  const eligibleValue = ((units as Array<{
    owned_by_user: string;
    state: string;
    card: { market_value_cents: number };
  }> | null) ?? [])
    .filter((u) => u.owned_by_user === user.id && u.state === "held")
    .reduce((acc, u) => acc + u.card.market_value_cents, 0);

  if (eligibleValue === 0) {
    return NextResponse.json({ error: "no_valid_cards" }, { status: 400 });
  }

  const shippingFee = estimateShipping(eligibleValue);

  // Resolve destination address (create if the client supplied a new one).
  let addressId = address_id;
  if (!addressId) {
    if (!new_address) return NextResponse.json({ error: "address_required" }, { status: 400 });
    const { data: inserted } = await admin
      .from("addresses")
      .insert({ user_id: user.id, ...new_address })
      .select("id")
      .single();
    addressId = inserted?.id ?? null;
  }
  if (!addressId) return NextResponse.json({ error: "address_create_failed" }, { status: 500 });

  // Single atomic RPC: validates ownership, debits wallet, creates shipment,
  // creates shipment_items, flips card_units, writes ledger row.
  const { data: rpcData, error: rpcErr } = await admin.rpc("request_shipment", {
    p_user_id: user.id,
    p_unit_ids: unit_ids,
    p_address_id: addressId,
    p_shipping_fee_cents: shippingFee,
  });

  if (rpcErr) {
    const msg = rpcErr.message || "shipment_failed";
    const status = /insufficient_funds/.test(msg)
      ? 402
      : /no_valid_cards|invalid_address/.test(msg)
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  return NextResponse.json({
    ok: true,
    shipment_id: result?.shipment_id,
    shipping_fee_cents: shippingFee,
    insured_value_cents: result?.insured_value_cents,
    item_count: result?.item_count,
  });
}
