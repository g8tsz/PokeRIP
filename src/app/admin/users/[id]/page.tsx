import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";
import { WalletAdjustForm } from "@/components/wallet-adjust-form";
import { FlagUserButton } from "@/components/flag-user-button";

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createSupabaseAdmin();

  const [{ data: profile }, { data: wallet }, { data: openings }, { data: txns }, { data: payouts }, { data: shipments }] =
    await Promise.all([
      admin.from("profiles").select("*").eq("id", id).maybeSingle(),
      admin.from("wallets").select("*").eq("user_id", id).maybeSingle(),
      admin
        .from("openings")
        .select("id, created_at, price_cents, payout_value_cents, pack:packs(name, slug), card:cards(name, rarity, image_url)")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("transactions")
        .select("id, kind, status, amount_cents, balance_after_cents, memo, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("payouts")
        .select("id, amount_cents, status, requested_at, paid_at, failure_reason")
        .eq("user_id", id)
        .order("requested_at", { ascending: false }),
      admin
        .from("shipments")
        .select("id, status, created_at, insured_value_cents, shipping_fee_cents")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!profile) notFound();

  const ripsList = ((openings as unknown) as Array<{
    id: string;
    created_at: string;
    price_cents: number;
    payout_value_cents: number;
    pack: { name: string; slug: string };
    card: { name: string; rarity: string; image_url: string | null };
  }>) ?? [];

  const totalSpent = ripsList.reduce((a, o) => a + Number(o.price_cents), 0);
  const totalPulled = ripsList.reduce((a, o) => a + Number(o.payout_value_cents), 0);

  return (
    <div>
      <Link href="/admin/users" className="text-sm text-white/50">← Users</Link>

      <header className="mt-3 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            {profile.display_name || profile.handle || profile.email.split("@")[0]}
            {profile.blocked && <span className="chip text-accent-pink border-accent-pink/30 bg-accent-pink/10 text-xs">BLOCKED</span>}
            {profile.kyc_verified && <span className="chip text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10 text-xs">KYC ✓</span>}
          </h1>
          <div className="text-white/50 text-sm mt-1">{profile.email}</div>
          <div className="text-white/40 text-xs mt-0.5 font-mono">{profile.id}</div>
          {profile.handle && (
            <div className="mt-1 text-xs">
              <Link href={`/u/${profile.handle}`} className="underline text-brand">
                /u/{profile.handle}
              </Link>
            </div>
          )}
        </div>
        <FlagUserButton userId={profile.id} blocked={profile.blocked} />
      </header>

      {/* Money overview */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Wallet balance" value={formatUSD(wallet?.balance_cents ?? 0)} />
        <Kpi label="Lifetime deposited" value={formatUSD(wallet?.lifetime_deposit_cents ?? 0)} />
        <Kpi label="Lifetime withdrawn" value={formatUSD(wallet?.lifetime_withdraw_cents ?? 0)} />
        <Kpi
          label="Net P&L on rips"
          value={`${totalPulled - totalSpent >= 0 ? "+" : ""}${formatUSD(totalPulled - totalSpent)}`}
          tone={totalPulled - totalSpent >= 0 ? "bad" : "good"}
          sub={`${formatUSD(totalSpent)} spent · ${formatUSD(totalPulled)} pulled`}
        />
      </div>

      {/* Wallet adjust */}
      <section className="mt-8 glass rounded-2xl p-6">
        <div className="font-display text-lg font-bold mb-3">Wallet adjustment</div>
        <p className="text-xs text-white/50 mb-3">
          Credit or debit this user. Writes a transaction ledger entry + audit log row with your
          admin id. Use for refunds, comps, error corrections.
        </p>
        <WalletAdjustForm userId={profile.id} />
      </section>

      {/* Recent rips */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display text-lg font-bold">Recent rips (50)</div>
        </div>
        <div className="glass rounded-2xl overflow-hidden text-sm">
          <table className="w-full">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/50">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Pack</th>
                <th className="p-3">Pulled</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3 text-right">Value</th>
                <th className="p-3 text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {ripsList.map((o) => {
                const delta = Number(o.payout_value_cents) - Number(o.price_cents);
                return (
                  <tr key={o.id} className="border-t border-white/5">
                    <td className="p-3 text-white/50">{new Date(o.created_at).toLocaleString()}</td>
                    <td className="p-3">{o.pack.name}</td>
                    <td className="p-3">
                      <span className={`text-rarity-${o.card.rarity}`}>{o.card.rarity}</span> {o.card.name}
                    </td>
                    <td className="p-3 text-right">{formatUSD(o.price_cents)}</td>
                    <td className="p-3 text-right">{formatUSD(o.payout_value_cents)}</td>
                    <td className={`p-3 text-right ${delta >= 0 ? "text-accent-cyan" : "text-white/50"}`}>
                      {delta >= 0 ? "+" : ""}
                      {formatUSD(delta)}
                    </td>
                  </tr>
                );
              })}
              {ripsList.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-white/50">
                    No rips yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Transactions */}
      <section className="mt-8">
        <div className="font-display text-lg font-bold mb-3">Transactions</div>
        <div className="glass rounded-2xl overflow-hidden text-sm">
          <table className="w-full">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/50">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Kind</th>
                <th className="p-3">Status</th>
                <th className="p-3">Memo</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-right">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {(txns ?? []).map((t: {
                id: string;
                kind: string;
                status: string;
                amount_cents: number;
                balance_after_cents: number;
                memo: string | null;
                created_at: string;
              }) => (
                <tr key={t.id} className="border-t border-white/5">
                  <td className="p-3 text-white/50">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="p-3 capitalize">{t.kind.replace("_", " ")}</td>
                  <td className="p-3 text-xs">{t.status}</td>
                  <td className="p-3 text-white/70 truncate max-w-[220px]">{t.memo}</td>
                  <td className={`p-3 text-right ${Number(t.amount_cents) >= 0 ? "text-accent-cyan" : ""}`}>
                    {Number(t.amount_cents) >= 0 ? "+" : ""}
                    {formatUSD(t.amount_cents)}
                  </td>
                  <td className="p-3 text-right">{formatUSD(t.balance_after_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payouts + Shipments summary */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <div className="font-display text-lg font-bold mb-3">Payouts</div>
          {(payouts ?? []).length === 0 ? (
            <div className="text-white/50 text-sm">No payouts.</div>
          ) : (
            <div className="space-y-2">
              {(payouts ?? []).map((p: {
                id: string;
                amount_cents: number;
                status: string;
                requested_at: string;
                paid_at: string | null;
                failure_reason: string | null;
              }) => (
                <div key={p.id} className="flex items-center justify-between text-sm p-3 bg-white/5 rounded-xl">
                  <div>
                    <div className="font-medium">{formatUSD(p.amount_cents)}</div>
                    <div className="text-xs text-white/50">
                      {new Date(p.requested_at).toLocaleString()}
                    </div>
                  </div>
                  <span className="chip text-xs">{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="font-display text-lg font-bold mb-3">Shipments</div>
          {(shipments ?? []).length === 0 ? (
            <div className="text-white/50 text-sm">No shipments.</div>
          ) : (
            <div className="space-y-2">
              {(shipments ?? []).map((s: {
                id: string;
                status: string;
                created_at: string;
                insured_value_cents: number;
                shipping_fee_cents: number;
              }) => (
                <div key={s.id} className="flex items-center justify-between text-sm p-3 bg-white/5 rounded-xl">
                  <div>
                    <div className="font-medium">{formatUSD(s.insured_value_cents)} insured</div>
                    <div className="text-xs text-white/50">
                      {new Date(s.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span className="chip text-xs">{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  const color = tone === "good" ? "text-accent-cyan" : tone === "bad" ? "text-accent-pink" : "";
  return (
    <div className="glass-strong rounded-2xl p-4">
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className={`font-display text-2xl font-black mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-white/50 mt-0.5">{sub}</div>}
    </div>
  );
}
