import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `invalid_signature: ${(e as Error).message}` }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.kind !== "wallet_deposit") break;
        const userId = session.metadata.user_id;
        const amount = session.amount_total ?? Number(session.metadata.amount_cents ?? 0);
        if (!userId || amount <= 0) break;

        await admin.rpc("credit_wallet", {
          p_user_id: userId,
          p_amount_cents: amount,
          p_kind: "deposit",
          p_reference_type: "stripe_checkout",
          p_reference_id: session.id,
          p_memo: "Card deposit",
        });
        break;
      }

      case "payout.paid":
      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;
        const status = event.type === "payout.paid" ? "paid" : "failed";
        await admin
          .from("payouts")
          .update({
            status,
            paid_at: status === "paid" ? new Date().toISOString() : null,
            failure_reason: payout.failure_message ?? null,
          })
          .eq("stripe_payout_id", payout.id);
        break;
      }

      case "account.updated": {
        // Stripe Connect Express onboarding status changed.
        const acct = event.data.object as Stripe.Account;
        await admin
          .from("profiles")
          .update({
            kyc_verified:
              !!acct.charges_enabled && !!acct.payouts_enabled && acct.details_submitted === true,
          })
          .eq("stripe_account_id", acct.id);
        break;
      }
    }
  } catch (e) {
    console.error("[stripe webhook]", event.type, e);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
