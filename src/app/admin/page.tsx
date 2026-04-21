import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";
import {
  getDailyMetrics,
  getPackPerformance,
  periodCompare,
  sumRange,
} from "@/lib/admin-data";
import { Sparkline } from "@/components/sparkline";

export const dynamic = "force-dynamic";

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

export default async function AdminHome() {
  const admin = createSupabaseAdmin();
  const [metrics, packPerf] = await Promise.all([getDailyMetrics(30), getPackPerformance()]);

  const cmp = periodCompare(metrics);
  const revenue30 = sumRange(metrics, "pack_revenue_cents");
  const deposits30 = sumRange(metrics, "deposit_cents");
  const withdrawals30 = sumRange(metrics, "withdrawal_cents");
  const valueAwarded30 = sumRange(metrics, "card_value_awarded_cents");
  const grossMargin30 = revenue30 - valueAwarded30;

  // Outstanding liabilities (real-time snapshot).
  const [{ data: walletsAgg }, { data: heldAgg }, { data: pendingPayouts }, { data: pendingShips }, { data: biggest }] =
    await Promise.all([
      admin.from("wallets").select("balance_cents"),
      admin.from("card_units").select("card:cards(market_value_cents)").eq("state", "held").not("owned_by_user", "is", null),
      admin
        .from("payouts")
        .select("id, amount_cents, user_id, requested_at, status, profile:profiles(email,handle)")
        .eq("status", "pending")
        .order("requested_at", { ascending: true })
        .limit(10),
      admin
        .from("shipments")
        .select("id, status, insured_value_cents, created_at, user_id")
        .eq("status", "requested")
        .order("created_at", { ascending: true })
        .limit(10),
      admin
        .from("openings")
        .select(
          "id, created_at, price_cents, payout_value_cents, user_id, pack:packs(name), card:cards(name, rarity, image_url)",
        )
        .order("payout_value_cents", { ascending: false })
        .limit(8),
    ]);

  const walletLiabilityCents = ((walletsAgg as { balance_cents: number }[] | null) ?? []).reduce(
    (a, w) => a + Number(w.balance_cents),
    0,
  );
  const inventoryLiabilityCents = ((heldAgg as unknown) as Array<{ card: { market_value_cents: number } }> | null ?? []).reduce(
    (a, u) => a + Number(u.card.market_value_cents),
    0,
  );

  const revenueSeries = metrics.map((m) => m.pack_revenue_cents / 100);
  const dauSeries = metrics.map((m) => m.dau);
  const signupsSeries = metrics.map((m) => m.signups);
  const depositSeries = metrics.map((m) => m.deposit_cents / 100);
  const dayLabels = metrics.map((m) => new Date(m.day).toLocaleDateString());

  return (
    <div>
      <header className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Overview</h1>
          <div className="text-sm text-white/50">Last 30 days · Updated just now</div>
        </div>
      </header>

      {/* Hero KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Revenue (30d)"
          value={formatUSD(revenue30)}
          deltaPct={cmp.pack_revenue_cents.pct}
          sub={`${cmp.pack_revenue_cents.value ? formatUSD(cmp.pack_revenue_cents.value) + " last 7d" : "—"}`}
        />
        <Kpi
          label="Deposits (30d)"
          value={formatUSD(deposits30)}
          deltaPct={cmp.deposit_cents.pct}
          sub={`${formatUSD(cmp.deposit_cents.value)} last 7d`}
        />
        <Kpi
          label="Withdrawals (30d)"
          value={formatUSD(withdrawals30)}
          deltaPct={cmp.withdrawal_cents.pct}
          tone="warn"
          sub={`${formatUSD(cmp.withdrawal_cents.value)} last 7d`}
        />
        <Kpi
          label="Gross margin (30d)"
          value={formatUSD(grossMargin30)}
          sub={
            revenue30 > 0
              ? `${((grossMargin30 / revenue30) * 100).toFixed(1)}% of rev`
              : "—"
          }
          tone={grossMargin30 >= 0 ? "good" : "bad"}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Signups (30d)" value={sumRange(metrics, "signups").toLocaleString()} deltaPct={cmp.signups.pct} />
        <Kpi label="Rips (30d)" value={sumRange(metrics, "rips").toLocaleString()} deltaPct={cmp.rips.pct} />
        <Kpi label="Wallet liability" value={formatUSD(walletLiabilityCents)} sub="Money users can withdraw" tone="warn" />
        <Kpi label="Card liability" value={formatUSD(inventoryLiabilityCents)} sub="Value of held cards not shipped" tone="warn" />
      </div>

      {/* Revenue chart */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Pack revenue / day" accent="#ffcc00">
          <Sparkline
            series={revenueSeries}
            labels={dayLabels}
            color="#ffcc00"
            format={(n) => `$${n.toFixed(2)}`}
            height={160}
          />
        </ChartCard>
        <ChartCard title="Deposits / day" accent="#5ce1a7">
          <Sparkline
            series={depositSeries}
            labels={dayLabels}
            color="#5ce1a7"
            format={(n) => `$${n.toFixed(2)}`}
            height={160}
          />
        </ChartCard>
        <ChartCard title="DAU (users who ripped)" accent="#5ab0ff">
          <Sparkline
            series={dauSeries}
            labels={dayLabels}
            color="#5ab0ff"
            format={(n) => `${n}`}
            height={140}
          />
        </ChartCard>
        <ChartCard title="Signups / day" accent="#b86cff">
          <Sparkline
            series={signupsSeries}
            labels={dayLabels}
            color="#b86cff"
            format={(n) => `${n}`}
            height={140}
          />
        </ChartCard>
      </section>

      {/* Ops queues */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display text-lg font-bold">Pending payouts</div>
            <Link href="/admin/payouts" className="text-xs text-brand hover:underline">
              Review all →
            </Link>
          </div>
          {pendingPayouts && pendingPayouts.length > 0 ? (
            <div className="space-y-2 text-sm">
              {(pendingPayouts as unknown as Array<{
                id: string;
                amount_cents: number;
                requested_at: string;
                profile: { email: string; handle: string | null } | null;
              }>).map((p) => (
                <Link
                  key={p.id}
                  href="/admin/payouts"
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10"
                >
                  <div>
                    <div className="font-medium">{formatUSD(p.amount_cents)}</div>
                    <div className="text-xs text-white/50">
                      {p.profile?.handle ? `@${p.profile.handle}` : p.profile?.email} ·{" "}
                      {new Date(p.requested_at).toLocaleString()}
                    </div>
                  </div>
                  <span className="chip text-brand border-brand/30 bg-brand/10">pending</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-white/50 text-sm py-4 text-center">Queue clear ✓</div>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display text-lg font-bold">Shipments to pack</div>
            <Link href="/admin/shipments" className="text-xs text-brand hover:underline">
              See all →
            </Link>
          </div>
          {pendingShips && pendingShips.length > 0 ? (
            <div className="space-y-2 text-sm">
              {(pendingShips as Array<{
                id: string;
                insured_value_cents: number;
                created_at: string;
              }>).map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <div>
                    <div className="font-medium">{formatUSD(s.insured_value_cents)} in cards</div>
                    <div className="text-xs text-white/50">{new Date(s.created_at).toLocaleString()}</div>
                  </div>
                  <span className="chip text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10">
                    requested
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-white/50 text-sm py-4 text-center">Nothing to pack 📭</div>
          )}
        </div>
      </section>

      {/* Pack performance */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display text-lg font-bold">Pack performance (lifetime)</div>
          <Link href="/admin/economics" className="text-xs text-brand hover:underline">
            Deep dive →
          </Link>
        </div>
        <div className="glass rounded-2xl overflow-hidden text-sm">
          <table className="w-full">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/50">
              <tr>
                <th className="p-3">Pack</th>
                <th className="p-3 text-right">Rips</th>
                <th className="p-3 text-right">Users</th>
                <th className="p-3 text-right">Gross</th>
                <th className="p-3 text-right">Value out</th>
                <th className="p-3 text-right">Actual RTP</th>
                <th className="p-3 text-right">Designed RTP</th>
                <th className="p-3 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {packPerf.map((p) => {
                const designedRtp = p.price_cents > 0 ? (p.expected_value_cents / p.price_cents) * 100 : 0;
                const margin = p.gross_cents - p.value_awarded_cents;
                const actualVsDesigned = p.actual_rtp_pct - designedRtp;
                return (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="p-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-white/40">{p.slug} · {formatUSD(p.price_cents)}</div>
                    </td>
                    <td className="p-3 text-right">{p.rips.toLocaleString()}</td>
                    <td className="p-3 text-right">{p.unique_users}</td>
                    <td className="p-3 text-right">{formatUSD(p.gross_cents)}</td>
                    <td className="p-3 text-right">{formatUSD(p.value_awarded_cents)}</td>
                    <td
                      className={`p-3 text-right ${
                        Math.abs(actualVsDesigned) > 10
                          ? actualVsDesigned > 0
                            ? "text-accent-pink"
                            : "text-accent-cyan"
                          : ""
                      }`}
                      title={`${actualVsDesigned >= 0 ? "+" : ""}${actualVsDesigned.toFixed(1)}pp vs designed`}
                    >
                      {p.actual_rtp_pct.toFixed(1)}%
                    </td>
                    <td className="p-3 text-right text-white/50">{designedRtp.toFixed(1)}%</td>
                    <td className={`p-3 text-right font-medium ${margin >= 0 ? "text-accent-cyan" : "text-accent-pink"}`}>
                      {formatUSD(margin)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Biggest pulls — good for marketing */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display text-lg font-bold">Biggest pulls of all time</div>
          <div className="text-xs text-white/40">Marketing-ready. Grab a screenshot.</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {((biggest as unknown) as Array<{
            id: string;
            created_at: string;
            price_cents: number;
            payout_value_cents: number;
            user_id: string;
            pack: { name: string };
            card: { name: string; rarity: Rarity; image_url: string | null };
          }> ?? []).map((o) => (
            <div key={o.id} className="card-tile p-3 flex gap-3 items-center">
              <div className="w-12 h-16 bg-bg-elev rounded-md overflow-hidden flex-shrink-0">
                {o.card.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.card.image_url} alt={o.card.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-xl">🎴</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{o.card.name}</div>
                <div className={`text-[10px] uppercase tracking-widest text-rarity-${o.card.rarity}`}>
                  {o.card.rarity}
                </div>
                <div className="flex items-center justify-between mt-0.5 text-xs">
                  <span className="text-white/40">{o.pack.name}</span>
                  <span className="text-accent-cyan font-semibold">
                    {formatUSD(o.payout_value_cents)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  deltaPct,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  deltaPct?: number;
  tone?: "good" | "bad" | "warn";
}) {
  const valueColor =
    tone === "good" ? "text-accent-cyan" : tone === "bad" ? "text-accent-pink" : tone === "warn" ? "text-brand" : "text-white";
  const deltaColor =
    deltaPct === undefined
      ? ""
      : deltaPct >= 0
        ? "text-accent-cyan"
        : "text-accent-pink";
  return (
    <div className="glass-strong rounded-2xl p-4">
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className={`font-display text-2xl font-black mt-1 ${valueColor}`}>{value}</div>
      <div className="text-xs text-white/50 mt-0.5 flex items-center gap-2">
        {deltaPct !== undefined && (
          <span className={deltaColor}>
            {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%
          </span>
        )}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-5" style={{ borderColor: `${accent}22` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-display text-sm uppercase tracking-widest text-white/50">{title}</div>
        <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
      </div>
      {children}
    </div>
  );
}
