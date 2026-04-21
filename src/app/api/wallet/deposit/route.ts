import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amount_cents: z.number().int().min(100).max(500000), // $1 – $5,000 per session
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_amount" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: user.email ?? profile?.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const appUrl = env().NEXT_PUBLIC_APP_URL;
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    success_url: `${appUrl}/wallet?deposit=success`,
    cancel_url: `${appUrl}/wallet?deposit=cancelled`,
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: parsed.data.amount_cents,
          product_data: { name: "PokéRip wallet deposit" },
        },
      },
    ],
    metadata: {
      user_id: user.id,
      kind: "wallet_deposit",
      amount_cents: String(parsed.data.amount_cents),
    },
  });

  return NextResponse.json({ url: session.url });
}
