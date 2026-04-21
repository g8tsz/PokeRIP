import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_account_id, email")
    .eq("id", user.id)
    .maybeSingle();

  let acctId = profile?.stripe_account_id ?? null;
  if (!acctId) {
    const acct = await stripe().accounts.create({
      type: "express",
      country: "US",
      email: user.email ?? profile?.email ?? undefined,
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { user_id: user.id },
    });
    acctId = acct.id;
    await admin.from("profiles").update({ stripe_account_id: acctId }).eq("id", user.id);
  }

  const appUrl = env().NEXT_PUBLIC_APP_URL;
  const link = await stripe().accountLinks.create({
    account: acctId,
    refresh_url: `${appUrl}/payouts?onboarding=refresh`,
    return_url: `${appUrl}/payouts?onboarding=done`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url });
}
