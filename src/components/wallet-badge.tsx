import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";

export async function WalletBadge({ userId }: { userId: string }) {
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("wallets").select("balance_cents").eq("user_id", userId).maybeSingle();
  const cents = Number(data?.balance_cents ?? 0);
  return (
    <Link
      href="/wallet"
      className="chip hover:border-brand/60 hover:bg-brand/10 transition"
      title="Wallet balance"
    >
      <span className="text-brand">●</span>
      <span className="font-semibold">{formatUSD(cents)}</span>
    </Link>
  );
}
