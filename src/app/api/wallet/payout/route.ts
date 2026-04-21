import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { guardPlayer } from "@/lib/guard";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amount_cents: z.number().int().min(100).max(1000000),
});

/**
 * Full payout flow:
 *   1. Check user has a Stripe Connect Express account with payouts enabled.
 *      If not, return an onboarding link URL for the user to complete KYC.
 *   2. Call `request_payout` RPC to atomically debit wallet + create pending payout row.
 *   3. Transfer funds from platform -> connected account.
 *   4. Trigger an instant/standard payout from the connected account to bank.
 *      (In test mode, Stripe will auto-pay via test bank tokens.)
 */
export async function POST(req: Request) {
  const gate = await guardPlayer();
  if (!gate.ok) return gate.response;
  const { user } = gate;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad_amount" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_account_id, email")
    .eq("id", user.id)
    .maybeSingle();

  const appUrl = env().NEXT_PUBLIC_APP_URL;

  // Ensure we have a Connect account + it's ready to receive payouts.
  let acctId = profile?.stripe_account_id ?? null;
  let payoutsEnabled = false;

  if (acctId) {
    const acct = await stripe().accounts.retrieve(acctId);
    payoutsEnabled = acct.payouts_enabled === true && acct.charges_enabled === true;
  }

  if (!acctId || !payoutsEnabled) {
    if (!acctId) {
      const acct = await stripe().accounts.create({
        type: "express",
        country: "US",
        email: user.email ?? profile?.email ?? undefined,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: { user_id: user.id },
      });
      acctId = acct.id;
      await admin.from("profiles").update({ stripe_account_id: acctId }).eq("id", user.id);
    }
    const link = await stripe().accountLinks.create({
      account: acctId,
      refresh_url: `${appUrl}/payouts?onboarding=refresh`,
      return_url: `${appUrl}/payouts?onboarding=done`,
      type: "account_onboarding",
    });
    return NextResponse.json(
      { error: "onboarding_required", onboarding_url: link.url },
      { status: 409 },
    );
  }

  // Atomic debit + pending payout row.
  const { data: payoutId, error: rpcErr } = await admin.rpc("request_payout", {
    p_user_id: user.id,
    p_amount_cents: parsed.data.amount_cents,
  });
  if (rpcErr) {
    const msg = rpcErr.message || "payout_failed";
    const status = /insufficient_funds/.test(msg) ? 402 : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  // Transfer to connected account then trigger a payout from there to bank.
  try {
    const transfer = await stripe().transfers.create({
      amount: parsed.data.amount_cents,
      currency: "usd",
      destination: acctId,
      transfer_group: `payout:${payoutId}`,
      metadata: { payout_id: String(payoutId), user_id: user.id },
    });

    const payout = await stripe().payouts.create(
      {
        amount: parsed.data.amount_cents,
        currency: "usd",
        method: "standard",
        metadata: { payout_id: String(payoutId), user_id: user.id },
      },
      { stripeAccount: acctId },
    );

    await admin
      .from("payouts")
      .update({
        status: "processing",
        stripe_transfer_id: transfer.id,
        stripe_payout_id: payout.id,
      })
      .eq("id", payoutId as string);

    return NextResponse.json({ ok: true, payout_id: payoutId });
  } catch (e) {
    // On Stripe failure, mark as failed + refund the wallet.
    await admin
      .from("payouts")
      .update({ status: "failed", failure_reason: (e as Error).message })
      .eq("id", payoutId as string);

    await admin.rpc("credit_wallet", {
      p_user_id: user.id,
      p_amount_cents: parsed.data.amount_cents,
      p_kind: "adjustment",
      p_reference_type: "payout_refund",
      p_reference_id: String(payoutId),
      p_memo: "Refund — ACH transfer failed",
    });

    return NextResponse.json({ error: "stripe_transfer_failed" }, { status: 502 });
  }
}
