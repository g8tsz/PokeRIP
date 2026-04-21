import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook handler.
 *
 * Events handled:
 *   checkout.session.completed      — credit wallet for a deposit
 *   payout.paid                      — mark payout paid
 *   payout.failed                    — mark payout failed + REFUND wallet
 *   account.updated                  — sync KYC state for Connect accounts
 *   charge.refunded                  — debit wallet for a merchant refund
 *   charge.dispute.created           — flag user, record dispute
 *   charge.dispute.funds_withdrawn   — debit wallet for clawed-back funds
 *   charge.dispute.closed            — best-effort un-flag on 'won'
 */
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

      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        await admin
          .from("payouts")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            failure_reason: null,
          })
          .eq("stripe_payout_id", payout.id);
        break;
      }

      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;

        // Find the payout row so we can refund the correct user.
        const { data: row } = await admin
          .from("payouts")
          .select("id, user_id, amount_cents, status")
          .eq("stripe_payout_id", payout.id)
          .maybeSingle();

        if (!row) {
          console.warn("[stripe webhook] payout.failed: no matching row for", payout.id);
          break;
        }

        // Refund the wallet via credit_wallet (idempotent on reference).
        // We intentionally use the same reference_type/id as the synchronous
        // failure path in /api/wallet/payout so a double-fire is a no-op.
        if (row.status !== "failed") {
          await admin.rpc("credit_wallet", {
            p_user_id: row.user_id,
            p_amount_cents: Number(row.amount_cents),
            p_kind: "adjustment",
            p_reference_type: "payout_refund",
            p_reference_id: String(row.id),
            p_memo: `Refund — ACH payout failed (${payout.failure_message ?? "unknown"})`,
          });
        }

        await admin
          .from("payouts")
          .update({
            status: "failed",
            failure_reason: payout.failure_message ?? "payout_failed",
          })
          .eq("id", row.id);
        break;
      }

      case "account.updated": {
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

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const userId = await resolveUserIdFromCharge(admin, charge);
        if (!userId) break;

        const refundedCents = charge.amount_refunded ?? 0;
        if (refundedCents <= 0) break;

        // Idempotency: scope by charge id. Multiple partial refunds on the
        // same charge will each call this handler with a cumulative
        // amount_refunded, so we key the ledger row on (charge, amount).
        await admin.rpc("reverse_deposit", {
          p_user_id: userId,
          p_amount_cents: refundedCents,
          p_reference_type: "stripe_refund",
          p_reference_id: `${charge.id}:${refundedCents}`,
          p_memo: "Deposit refunded by Stripe",
        });
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const userId = await resolveUserIdFromDispute(admin, dispute);
        if (!userId) break;

        // Block the user immediately — chargebacks are nearly always fraud
        // or an unhappy customer we don't want taking more risk on.
        await admin
          .from("profiles")
          .update({
            blocked: true,
            blocked_reason: `dispute_${dispute.reason} ($${(dispute.amount / 100).toFixed(2)})`,
          })
          .eq("id", userId);
        break;
      }

      case "charge.dispute.funds_withdrawn": {
        const dispute = event.data.object as Stripe.Dispute;
        const userId = await resolveUserIdFromDispute(admin, dispute);
        if (!userId) break;

        await admin.rpc("reverse_deposit", {
          p_user_id: userId,
          p_amount_cents: dispute.amount,
          p_reference_type: "stripe_dispute",
          p_reference_id: dispute.id,
          p_memo: `Dispute clawback (${dispute.reason})`,
        });
        break;
      }

      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        // If the dispute was won, optionally un-flag. We do NOT credit funds
        // back — Stripe's `charge.dispute.funds_reinstated` handles that.
        if (dispute.status === "won") {
          const userId = await resolveUserIdFromDispute(admin, dispute);
          if (!userId) break;
          await admin
            .from("profiles")
            .update({ blocked: false, blocked_reason: null })
            .eq("id", userId)
            .eq("blocked_reason", `dispute_${dispute.reason} ($${(dispute.amount / 100).toFixed(2)})`);
        }
        break;
      }

      case "charge.dispute.funds_reinstated": {
        const dispute = event.data.object as Stripe.Dispute;
        const userId = await resolveUserIdFromDispute(admin, dispute);
        if (!userId) break;
        await admin.rpc("credit_wallet", {
          p_user_id: userId,
          p_amount_cents: dispute.amount,
          p_kind: "adjustment",
          p_reference_type: "stripe_dispute_reinstated",
          p_reference_id: dispute.id,
          p_memo: "Dispute funds reinstated",
        });
        break;
      }
    }
  } catch (e) {
    console.error("[stripe webhook]", event.type, e);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

type AdminClient = ReturnType<typeof createSupabaseAdmin>;

async function resolveUserIdFromCharge(
  admin: AdminClient,
  charge: Stripe.Charge,
): Promise<string | null> {
  // Charges from our deposit flow are created via checkout.session, so
  // the user_id ends up on the charge's metadata OR on the linked customer.
  const metaUser = (charge.metadata?.user_id as string | undefined) ?? null;
  if (metaUser) return metaUser;

  const customerId =
    typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;
  if (!customerId) return null;

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
}

async function resolveUserIdFromDispute(
  admin: AdminClient,
  dispute: Stripe.Dispute,
): Promise<string | null> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;

  // Best effort: fetch the charge to get customer / metadata.
  try {
    const charge = await stripe().charges.retrieve(chargeId);
    return await resolveUserIdFromCharge(admin, charge);
  } catch {
    return null;
  }
}
