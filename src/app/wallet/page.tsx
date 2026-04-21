import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";
import { DepositForm } from "@/components/deposit-form";
import { PayoutForm } from "@/components/payout-form";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Txn = {
  id: string;
  kind: string;
  amount_cents: number;
  balance_after_cents: number;
  memo: string | null;
  created_at: string;
};

export default async function WalletPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();
  const [{ data: wallet }, { data: txns }] = await Promise.all([
    admin
      .from("wallets")
      .select("balance_cents, lifetime_deposit_cents, lifetime_withdraw_cents")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("transactions")
      .select("id, kind, amount_cents, balance_after_cents, memo, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const balance = Number(wallet?.balance_cents ?? 0);
  const lifetimeDeposit = Number(wallet?.lifetime_deposit_cents ?? 0);
  const lifetimeWithdraw = Number(wallet?.lifetime_withdraw_cents ?? 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-4xl font-bold">Wallet</h1>

      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <div className="glass-strong rounded-2xl p-6 md:col-span-1">
          <div className="text-xs uppercase tracking-widest text-white/40">Available</div>
          <div className="font-display text-5xl font-black mt-2">{formatUSD(balance)}</div>
          <div className="mt-4 text-xs text-white/50 space-y-0.5">
            <div>Deposited all-time: {formatUSD(lifetimeDeposit)}</div>
            <div>Cashed out all-time: {formatUSD(lifetimeWithdraw)}</div>
          </div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="font-semibold mb-3">Deposit</div>
          <DepositForm />
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="font-semibold mb-3">Cash out (ACH)</div>
          <PayoutForm balanceCents={balance} />
          <p className="mt-3 text-[11px] text-white/40">
            Payouts require one-time Stripe Connect onboarding (bank + ID).{" "}
            <Link href="/payouts" className="underline">Manage</Link>.
          </p>
        </div>
      </div>

      <h2 className="mt-12 font-display text-2xl font-bold">Activity</h2>
      <div className="mt-4 glass rounded-2xl divide-y divide-white/5">
        {(txns as Txn[] | null)?.length ? (
          (txns as Txn[]).map((t) => (
            <div key={t.id} className="p-4 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium capitalize">{t.kind.replace("_", " ")}</div>
                <div className="text-white/40 text-xs">
                  {new Date(t.created_at).toLocaleString()} · {t.memo}
                </div>
              </div>
              <div className="text-right">
                <div className={t.amount_cents >= 0 ? "text-accent-cyan" : "text-white"}>
                  {t.amount_cents >= 0 ? "+" : ""}
                  {formatUSD(t.amount_cents)}
                </div>
                <div className="text-xs text-white/40">
                  bal {formatUSD(t.balance_after_cents)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-white/50">No activity yet.</div>
        )}
      </div>
    </div>
  );
}
