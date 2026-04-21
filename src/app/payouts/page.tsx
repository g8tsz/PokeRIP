import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";
import { ConnectOnboardButton } from "@/components/connect-onboard-button";

export const dynamic = "force-dynamic";

type PayoutRow = {
  id: string;
  amount_cents: number;
  status: string;
  requested_at: string;
  paid_at: string | null;
  failure_reason: string | null;
};

export default async function PayoutsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();
  const [{ data: profile }, { data: payouts }] = await Promise.all([
    admin.from("profiles").select("stripe_account_id, kyc_verified").eq("id", user.id).maybeSingle(),
    admin
      .from("payouts")
      .select("id, amount_cents, status, requested_at, paid_at, failure_reason")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(50),
  ]);

  const onboarded = !!profile?.kyc_verified;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-4xl font-bold">ACH Payouts</h1>

      <div className="mt-6 glass-strong rounded-2xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="font-semibold">Bank account & KYC</div>
            <div className="text-sm text-white/60 mt-1">
              {onboarded
                ? "✓ Your account is verified and payouts are enabled."
                : "To cash out via ACH, complete one-time Stripe Connect onboarding (bank account + ID verification)."}
            </div>
          </div>
          <ConnectOnboardButton onboarded={onboarded} />
        </div>
      </div>

      <h2 className="mt-12 font-display text-2xl font-bold">History</h2>
      <div className="mt-4 glass rounded-2xl divide-y divide-white/5">
        {(payouts as PayoutRow[] | null)?.length ? (
          (payouts as PayoutRow[]).map((p) => (
            <div key={p.id} className="p-4 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{formatUSD(p.amount_cents)}</div>
                <div className="text-white/40 text-xs">
                  Requested {new Date(p.requested_at).toLocaleString()}
                  {p.paid_at ? ` · Paid ${new Date(p.paid_at).toLocaleDateString()}` : ""}
                </div>
                {p.failure_reason && (
                  <div className="text-accent-pink text-xs mt-1">{p.failure_reason}</div>
                )}
              </div>
              <div className={`chip ${statusColor(p.status)}`}>{p.status}</div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-white/50">
            No payouts yet. Head to{" "}
            <Link href="/wallet" className="underline">
              Wallet
            </Link>{" "}
            to request one.
          </div>
        )}
      </div>
    </div>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case "paid":
      return "text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10";
    case "failed":
      return "text-accent-pink border-accent-pink/30 bg-accent-pink/10";
    case "processing":
    case "pending":
      return "text-brand border-brand/30 bg-brand/10";
    default:
      return "";
  }
}
