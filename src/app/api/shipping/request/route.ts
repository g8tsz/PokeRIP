import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
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
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { unit_ids, address_id, new_address } = parsed.data;

  const admin = createSupabaseAdmin();

  // Validate units belong to user + are held.
  const { data: units } = await admin
    .from("card_units")
    .select("id, owned_by_user, state, card:cards(market_value_cents)")
    .in("id", unit_ids);

  const validUnits = (units as Array<{
    id: string;
    owned_by_user: string;
    state: string;
    card: { market_value_cents: number };
  }> | null)?.filter((u) => u.owned_by_user === user.id && u.state === "held") ?? [];

  if (validUnits.length === 0) {
    return NextResponse.json({ error: "no_valid_cards" }, { status: 400 });
  }

  // Resolve address.
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

  const totalValue = validUnits.reduce((acc, u) => acc + u.card.market_value_cents, 0);
  const shippingFee = estimateShipping(totalValue);

  // Debit wallet for shipping fee (skip if zero).
  if (shippingFee > 0) {
    const { data: wallet } = await admin
      .from("wallets")
      .select("balance_cents")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!wallet || Number(wallet.balance_cents) < shippingFee) {
      return NextResponse.json({ error: "insufficient_funds_for_shipping" }, { status: 402 });
    }
    // We don't have a dedicated RPC for shipping fee debits — use a direct update + ledger row.
    // In production this should also be an atomic RPC.
    await admin
      .from("wallets")
      .update({ balance_cents: Number(wallet.balance_cents) - shippingFee })
      .eq("user_id", user.id);
    await admin.from("transactions").insert({
      user_id: user.id,
      kind: "shipping_fee",
      status: "succeeded",
      amount_cents: -shippingFee,
      balance_after_cents: Number(wallet.balance_cents) - shippingFee,
      reference_type: "shipment_pending",
      reference_id: addressId,
      memo: "Shipping fee",
    });
  }

  // Create shipment + mark units as ship_requested.
  const { data: shipment } = await admin
    .from("shipments")
    .insert({
      user_id: user.id,
      address_id: addressId,
      status: "requested",
      shipping_fee_cents: shippingFee,
      insured_value_cents: totalValue,
    })
    .select("id")
    .single();

  if (shipment) {
    await admin.from("shipment_items").insert(
      validUnits.map((u) => ({ shipment_id: shipment.id, card_unit_id: u.id })),
    );
    await admin
      .from("card_units")
      .update({ state: "ship_requested", updated_at: new Date().toISOString() })
      .in(
        "id",
        validUnits.map((u) => u.id),
      );
  }

  return NextResponse.json({ ok: true, shipment_id: shipment?.id });
}
