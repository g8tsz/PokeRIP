import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";
import { getFunnelCounts, getDailyMetrics, sumRange } from "@/lib/admin-data";
import { Sparkline, BarChart } from "@/components/sparkline";

export const dynamic = "force-dynamic";

type Profile = { id: string; created_at: string };
type Opening = { user_id: string; created_at: string };
type Transaction = { user_id: string; amount_cents: number; created_at: string; kind: string };

export default async function AdminAnalytics() {
  const admin = createSupabaseAdmin();

  const [funnel, metrics, { data: profiles }, { data: openings }, { data: deposits }] =
    await Promise.all([
      getFunnelCounts(),
      getDailyMetrics(90),
      admin.from("profiles").select("id, created_at").order("created_at", { ascending: true }),
      admin.from("openings").select("user_id, created_at"),
      admin
        .from("transactions")
        .select("user_id, amount_cents, created_at, kind")
        .eq("kind", "deposit")
        .eq("status", "succeeded"),
    ]);

  const profs = (profiles as Profile[] | null) ?? [];
  const opns = (openings as Opening[] | null) ?? [];
  const deps = (deposits as Transaction[] | null) ?? [];

  // ---- Funnel (absolute numbers + conversion %) ----
  const funnelSteps = [
    { label: "Signups", value: funnel.signups },
    { label: "Made a deposit", value: funnel.first_deposit },
    { label: "Ripped a pack", value: funnel.first_rip },
    { label: "Cashed out", value: funnel.payouts },
  ];

  // ---- ARPU / ARPPU ----
  const payingUsers = new Set(deps.map((d) => d.user_id));
  const totalDeposits = deps.reduce((a, d) => a + Number(d.amount_cents), 0);
  const arpu = profs.length > 0 ? totalDeposits / profs.length : 0;
  const arppu = payingUsers.size > 0 ? totalDeposits / payingUsers.size : 0;

  // ---- Deposit-size distribution ----
  const buckets = [
    { label: "< $5",    max: 500,     count: 0 },
    { label: "$5–25",   max: 2500,    count: 0 },
    { label: "$25–50",  max: 5000,    count: 0 },
    { label: "$50–100", max: 10000,   count: 0 },
    { label: "$100–250",max: 25000,   count: 0 },
    { label: "$250–500",max: 50000,   count: 0 },
    { label: "$500+",   max: Infinity,count: 0 },
  ];
  for (const d of deps) {
    const a = Number(d.amount_cents);
    const b = buckets.find((b) => a <= b.max)!;
    b.count++;
  }

  // ---- Weekly signup cohorts: week N → % who ripped in week 0, 1, 2, 3 ----
  // Simplified D1/D7/D30 retention based on pack-rip activity.
  const firstRipByUser = new Map<string, number>();
  for (const o of opns) {
    const t = new Date(o.created_at).getTime();
    const cur = firstRipByUser.get(o.user_id);
    if (cur === undefined || t < cur) firstRipByUser.set(o.user_id, t);
  }
  const d = (ms: number) => ms / (1000 * 60 * 60 * 24);
  let d1 = 0, d7 = 0, d30 = 0;
  let d1d = 0, d7d = 0, d30d = 0;
  const now = Date.now();
  for (const p of profs) {
    const created = new Date(p.created_at).getTime();
    const age = d(now - created);
    if (age >= 1) {
      d1d++;
      const first = firstRipByUser.get(p.id);
      if (first !== undefined && d(first - created) <= 1) d1++;
    }
    if (age >= 7) {
      d7d++;
      const first = firstRipByUser.get(p.id);
      if (first !== undefined && d(first - created) <= 7) d7++;
    }
    if (age >= 30) {
      d30d++;
      const first = firstRipByUser.get(p.id);
      if (first !== undefined && d(first - created) <= 30) d30++;
    }
  }

  // ---- Paid user ratio ----
  const paidRatio = profs.length > 0 ? (payingUsers.size / profs.length) * 100 : 0;

  // ---- Time-series for charts ----
  const dayLabels = metrics.map((m) => new Date(m.day).toLocaleDateString());
  const totalSpent30 = sumRange(metrics.slice(-30), "pack_revenue_cents");
  const totalRevenue90 = sumRange(metrics, "pack_revenue_cents");

  // ---- Weekly active users (distinct user_id / week) ----
  const weekBuckets = new Map<string, Set<string>>();
  for (const o of opns) {
    const dt = new Date(o.created_at);
    // ISO week key yyyy-Www
    const y = dt.getUTCFullYear();
    const week = Math.floor(
      (Date.UTC(y, dt.getUTCMonth(), dt.getUTCDate()) - Date.UTC(y, 0, 1)) /
        (7 * 24 * 60 * 60 * 1000),
    );
    const key = `${y}-W${String(week).padStart(2, "0")}`;
    if (!weekBuckets.has(key)) weekBuckets.set(key, new Set());
    weekBuckets.get(key)!.add(o.user_id);
  }
  const weeks = [...weekBuckets.entries()].sort().slice(-12);
  const wauSeries = weeks.map(([, set]) => set.size);
  const wauLabels = weeks.map(([k]) => k);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">Analytics</h1>
        <div className="text-sm text-white/50">Marketing funnel, retention, monetization</div>
      </header>

      {/* Top KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total users" value={profs.length.toLocaleString()} sub={`${payingUsers.size} paid (${paidRatio.toFixed(1)}%)`} />
        <Kpi label="ARPU" value={formatUSD(arpu)} sub="Avg revenue / user" />
        <Kpi label="ARPPU" value={formatUSD(arppu)} sub="Avg revenue / paying user" />
        <Kpi label="Revenue (90d)" value={formatUSD(totalRevenue90)} sub={`${formatUSD(totalSpent30)} last 30d`} />
      </div>

      {/* Funnel */}
      <section className="mt-8">
        <div className="glass rounded-2xl p-6">
          <div className="font-display text-lg font-bold mb-4">Acquisition funnel</div>
          <div className="space-y-3">
            {funnelSteps.map((s, i) => {
              const pct = funnelSteps[0]!.value > 0 ? (s.value / funnelSteps[0]!.value) * 100 : 0;
              const stepPct =
                i === 0 || funnelSteps[i - 1]!.value === 0
                  ? 100
                  : (s.value / funnelSteps[i - 1]!.value) * 100;
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="font-medium">{s.label}</div>
                    <div className="text-white/60">
                      <span className="font-semibold text-white">{s.value.toLocaleString()}</span>{" "}
                      · {pct.toFixed(1)}% of top
                      {i > 0 && <span className="ml-2 text-accent-cyan">→ {stepPct.toFixed(1)}% step</span>}
                    </div>
                  </div>
                  <div className="h-8 rounded-lg bg-white/5 overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(2, pct)}%`,
                        background: `linear-gradient(90deg, ${["#ffcc00", "#5ce1a7", "#5ab0ff", "#b86cff"][i]}aa, ${["#ffcc00", "#5ce1a7", "#5ab0ff", "#b86cff"][i]})`,
                        boxShadow: `0 0 20px -4px ${["#ffcc00", "#5ce1a7", "#5ab0ff", "#b86cff"][i]}`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Retention */}
      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="glass rounded-2xl p-6">
          <div className="font-display text-lg font-bold mb-4">Activation (signup → first rip)</div>
          <div className="grid grid-cols-3 gap-3">
            <RetentionBlock label="D1" ratio={d1 / Math.max(1, d1d)} num={d1} den={d1d} />
            <RetentionBlock label="D7" ratio={d7 / Math.max(1, d7d)} num={d7} den={d7d} />
            <RetentionBlock label="D30" ratio={d30 / Math.max(1, d30d)} num={d30} den={d30d} />
          </div>
          <p className="text-xs text-white/40 mt-4">
            Of users whose account is at least N days old, what % ripped at least one pack within N days of signing up.
          </p>
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="font-display text-lg font-bold mb-4">Weekly active users (last 12 weeks)</div>
          <BarChart series={wauSeries} labels={wauLabels} height={160} color="#00e5ff" />
        </div>
      </section>

      {/* Deposit distribution */}
      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="glass rounded-2xl p-6">
          <div className="font-display text-lg font-bold mb-4">Deposit-size distribution</div>
          <div className="space-y-2">
            {buckets.map((b) => {
              const total = buckets.reduce((a, c) => a + c.count, 0);
              const pct = total > 0 ? (b.count / total) * 100 : 0;
              return (
                <div key={b.label} className="flex items-center gap-3 text-sm">
                  <div className="w-20 text-white/60">{b.label}</div>
                  <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">
                    <div
                      className="h-full bg-brand"
                      style={{ width: `${Math.max(pct, pct > 0 ? 1 : 0)}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-white/70 tabular-nums">
                    {b.count} <span className="text-white/40">({pct.toFixed(0)}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="font-display text-lg font-bold mb-4">Revenue trend (90d)</div>
          <Sparkline
            series={metrics.map((m) => m.pack_revenue_cents / 100)}
            labels={dayLabels}
            color="#ffcc00"
            format={(n) => `$${n.toFixed(2)}`}
            height={160}
          />
        </div>
      </section>

      {/* Key numbers */}
      <section className="mt-8">
        <div className="glass rounded-2xl p-6">
          <div className="font-display text-lg font-bold mb-4">At a glance</div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Mini label="Total deposits lifetime" value={formatUSD(totalDeposits)} />
            <Mini label="Paying users" value={payingUsers.size.toLocaleString()} />
            <Mini label="Deposits / user" value={profs.length > 0 ? (deps.length / profs.length).toFixed(2) : "0"} />
            <Mini label="Avg deposit size" value={deps.length > 0 ? formatUSD(totalDeposits / deps.length) : "$0"} />
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass-strong rounded-2xl p-4">
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className="font-display text-2xl font-black mt-1">{value}</div>
      {sub && <div className="text-xs text-white/50 mt-0.5">{sub}</div>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className="font-semibold text-base mt-0.5">{value}</div>
    </div>
  );
}

function RetentionBlock({ label, ratio, num, den }: { label: string; ratio: number; num: number; den: number }) {
  const pct = ratio * 100;
  return (
    <div className="glass rounded-xl p-4 text-center">
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className="font-display text-2xl font-black mt-1">{pct.toFixed(1)}%</div>
      <div className="text-[11px] text-white/40 mt-1">
        {num} / {den}
      </div>
    </div>
  );
}
