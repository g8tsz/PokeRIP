import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD, formatOdds } from "@/lib/utils";
import { getPackPerformance } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

export default async function AdminEconomics() {
  const admin = createSupabaseAdmin();
  const perf = await getPackPerformance();

  // Per-pack rarity hit distribution (actual vs expected based on weights)
  const { data: rewardsRaw } = await admin
    .from("pack_rewards")
    .select("pack_id, weight, awarded_count, card:cards(rarity)");
  const rewards =
    ((rewardsRaw as unknown) as Array<{
      pack_id: string;
      weight: number;
      awarded_count: number;
      card: { rarity: Rarity };
    }> | null) ?? [];

  // Group by pack → rarity
  type RarityDist = Record<Rarity, { expectedWeight: number; actualCount: number }>;
  const blankDist = (): RarityDist =>
    RARITY_ORDER.reduce((acc, r) => ({ ...acc, [r]: { expectedWeight: 0, actualCount: 0 } }), {} as RarityDist);

  const packRarity = new Map<string, RarityDist>();
  const packTotalWeight = new Map<string, number>();
  const packTotalCount = new Map<string, number>();
  for (const r of rewards) {
    if (!packRarity.has(r.pack_id)) packRarity.set(r.pack_id, blankDist());
    const dist = packRarity.get(r.pack_id)!;
    dist[r.card.rarity].expectedWeight += r.weight;
    dist[r.card.rarity].actualCount += r.awarded_count;
    packTotalWeight.set(r.pack_id, (packTotalWeight.get(r.pack_id) ?? 0) + r.weight);
    packTotalCount.set(r.pack_id, (packTotalCount.get(r.pack_id) ?? 0) + r.awarded_count);
  }

  // Biggest pulls per pack (top 3 each)
  const { data: allBiggestRaw } = await admin
    .from("openings")
    .select("id, pack_id, payout_value_cents, card:cards(name, rarity, image_url)")
    .order("payout_value_cents", { ascending: false })
    .limit(100);
  const biggestByPack = new Map<string, Array<{
    id: string;
    payout: number;
    card: { name: string; rarity: Rarity; image_url: string | null };
  }>>();
  for (const o of ((allBiggestRaw as unknown) as Array<{
    id: string;
    pack_id: string;
    payout_value_cents: number;
    card: { name: string; rarity: Rarity; image_url: string | null };
  }>) ?? []) {
    if (!biggestByPack.has(o.pack_id)) biggestByPack.set(o.pack_id, []);
    const arr = biggestByPack.get(o.pack_id)!;
    if (arr.length < 3)
      arr.push({ id: o.id, payout: Number(o.payout_value_cents), card: o.card });
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">Economics</h1>
        <div className="text-sm text-white/50">
          Per-pack RTP health, rarity distribution, and chase-card hits
        </div>
      </header>

      {/* House-wide summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Kpi
          label="Total pack revenue"
          value={formatUSD(perf.reduce((a, p) => a + p.gross_cents, 0))}
        />
        <Kpi
          label="Total cards awarded value"
          value={formatUSD(perf.reduce((a, p) => a + p.value_awarded_cents, 0))}
          tone="warn"
        />
        <Kpi
          label="House margin"
          value={formatUSD(perf.reduce((a, p) => a + (p.gross_cents - p.value_awarded_cents), 0))}
          tone="good"
        />
        <Kpi
          label="Overall RTP"
          value={`${(
            (perf.reduce((a, p) => a + p.value_awarded_cents, 0) /
              Math.max(1, perf.reduce((a, p) => a + p.gross_cents, 0))) *
            100
          ).toFixed(1)}%`}
        />
      </div>

      {/* Per-pack deep dive */}
      <div className="space-y-8">
        {perf.map((p) => {
          const designedRtp = p.price_cents > 0 ? (p.expected_value_cents / p.price_cents) * 100 : 0;
          const diff = p.actual_rtp_pct - designedRtp;
          const dist = packRarity.get(p.id);
          const totalW = packTotalWeight.get(p.id) ?? 0;
          const totalC = packTotalCount.get(p.id) ?? 0;
          const biggest = biggestByPack.get(p.id) ?? [];

          return (
            <section key={p.id} className="glass rounded-2xl p-6">
              <header className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div>
                  <div className="font-display text-xl font-bold">{p.name}</div>
                  <div className="text-xs text-white/50">
                    {p.slug} · {formatUSD(p.price_cents)} · {p.rips.toLocaleString()} rips
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill label="Designed RTP" value={`${designedRtp.toFixed(1)}%`} />
                  <Pill
                    label="Actual RTP"
                    value={`${p.actual_rtp_pct.toFixed(1)}%`}
                    tone={
                      Math.abs(diff) > 10
                        ? diff > 0
                          ? "bad"
                          : "good"
                        : "neutral"
                    }
                  />
                  <Pill
                    label="Δ vs design"
                    value={`${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`}
                    tone={Math.abs(diff) > 10 ? "warn" : "neutral"}
                  />
                  <Pill
                    label="Gross margin"
                    value={formatUSD(p.gross_cents - p.value_awarded_cents)}
                    tone={p.gross_cents - p.value_awarded_cents >= 0 ? "good" : "bad"}
                  />
                </div>
              </header>

              {/* Rarity distribution */}
              {dist && totalW > 0 && (
                <div className="mt-4">
                  <div className="text-xs uppercase tracking-widest text-white/40 mb-2">
                    Rarity distribution — expected vs actual
                  </div>
                  <div className="space-y-2">
                    {RARITY_ORDER.map((r) => {
                      const exp = dist[r].expectedWeight / totalW;
                      const act = totalC > 0 ? dist[r].actualCount / totalC : 0;
                      if (exp === 0 && act === 0) return null;
                      return (
                        <div key={r} className="flex items-center gap-3 text-xs">
                          <div className={`w-20 text-rarity-${r} uppercase font-semibold`}>{r}</div>
                          <div className="flex-1 flex items-center gap-2">
                            <div className="flex-1 h-3 rounded bg-white/5 overflow-hidden relative">
                              <div
                                className="absolute inset-y-0 left-0 bg-white/25"
                                style={{ width: `${exp * 100}%` }}
                                title={`Expected ${(exp * 100).toFixed(2)}%`}
                              />
                              <div
                                className={`absolute inset-y-0 left-0`}
                                style={{
                                  width: `${act * 100}%`,
                                  background:
                                    act > exp * 1.2 && r !== "common"
                                      ? "#ff4d6d"
                                      : act < exp * 0.8 && r !== "common"
                                        ? "#5ce1a7"
                                        : "#ffcc00",
                                  opacity: 0.85,
                                  mixBlendMode: "screen",
                                }}
                                title={`Actual ${(act * 100).toFixed(2)}%`}
                              />
                            </div>
                            <div className="w-40 text-right text-white/60 tabular-nums">
                              {formatOdds(dist[r].expectedWeight, totalW)} →{" "}
                              <span className="text-white">
                                {totalC > 0 ? `${(act * 100).toFixed(2)}%` : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-white/40 mt-2">
                    Light bar = expected probability. Colored bar = actual hit rate ({totalC} total pulls).
                    With small sample sizes, expect variance. Investigate if pulls ≥1k and deltas stay &gt;30%.
                  </div>
                </div>
              )}

              {/* Biggest hits for this pack */}
              {biggest.length > 0 && (
                <div className="mt-6">
                  <div className="text-xs uppercase tracking-widest text-white/40 mb-2">
                    Top hits
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {biggest.map((b) => (
                      <div key={b.id} className="flex gap-3 items-center p-2 rounded-xl bg-white/5">
                        <div className="w-10 h-14 bg-bg-elev rounded overflow-hidden">
                          {b.card.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.card.image_url} alt={b.card.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full grid place-items-center">🎴</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{b.card.name}</div>
                          <div className={`text-[10px] uppercase tracking-widest text-rarity-${b.card.rarity}`}>
                            {b.card.rarity}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-accent-cyan">
                          {formatUSD(b.payout)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "warn";
}) {
  const color =
    tone === "good" ? "text-accent-cyan" : tone === "bad" ? "text-accent-pink" : tone === "warn" ? "text-brand" : "text-white";
  return (
    <div className="glass-strong rounded-2xl p-4">
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className={`font-display text-2xl font-black mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10"
      : tone === "bad"
        ? "text-accent-pink border-accent-pink/30 bg-accent-pink/10"
        : tone === "warn"
          ? "text-brand border-brand/30 bg-brand/10"
          : "";
  return (
    <div className={`chip ${color}`}>
      <span className="text-white/50">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
