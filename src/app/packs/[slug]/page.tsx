import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatOdds, formatUSD } from "@/lib/utils";
import { OpenPackClient } from "@/components/open-pack-client";
import Link from "next/link";

type Reward = {
  id: string;
  weight: number;
  card: {
    id: string;
    name: string;
    rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
    image_url: string | null;
    market_value_cents: number;
    set_name: string | null;
  };
};

export default async function PackDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createSupabaseAdmin();
  const { data: pack } = await admin
    .from("packs")
    .select("id,slug,name,tagline,description,price_cents,theme_color")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (!pack) notFound();

  const { data: rewardsRaw } = await admin
    .from("pack_rewards")
    .select(
      "id, weight, card:cards(id, name, rarity, image_url, market_value_cents, set_name)",
    )
    .eq("pack_id", pack.id)
    .order("weight", { ascending: true });

  const rewards = (rewardsRaw as Reward[] | null) ?? [];
  const totalWeight = rewards.reduce((acc, r) => acc + r.weight, 0);
  const ev =
    totalWeight > 0
      ? rewards.reduce((acc, r) => acc + (r.weight / totalWeight) * r.card.market_value_cents, 0)
      : 0;

  // Group rewards by rarity for display
  const byRarity = rewards.reduce<Record<string, Reward[]>>((acc, r) => {
    (acc[r.card.rarity] ??= []).push(r);
    return acc;
  }, {});
  const rarityOrder = ["mythic", "legendary", "epic", "rare", "uncommon", "common"] as const;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Link href="/packs" className="text-sm text-white/50 hover:text-white">
        ← All packs
      </Link>

      <header className="mt-4 grid md:grid-cols-[1fr_auto] gap-6 items-end">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40">{pack.slug}</div>
          <h1 className="font-display text-5xl md:text-6xl font-black mt-1">{pack.name}</h1>
          <p className="text-white/60 mt-3 max-w-2xl">{pack.description}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-5xl font-black">{formatUSD(pack.price_cents)}</div>
          <div className="text-xs text-white/50 mt-1">per pack</div>
        </div>
      </header>

      <div
        className="mt-8 rounded-3xl p-8 glass-strong"
        style={{ boxShadow: `0 0 100px -30px ${pack.theme_color ?? "#8a5cff"}` }}
      >
        <OpenPackClient packId={pack.id} packSlug={pack.slug} priceCents={pack.price_cents} />
      </div>

      {/* Stats */}
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Stat label="Expected value" value={formatUSD(Math.round(ev))} />
        <Stat label="Possible outcomes" value={rewards.length.toString()} />
        <Stat label="Best possible pull" value={formatUSD(Math.max(0, ...rewards.map((r) => r.card.market_value_cents)))} />
      </div>

      {/* Odds table */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold mb-6">Loot table</h2>
        {rewards.length === 0 ? (
          <div className="glass p-8 rounded-2xl text-center text-white/60">
            This pack hasn&apos;t been configured yet. Admins — add rewards in{" "}
            <Link href="/admin/packs" className="underline">the admin console</Link>.
          </div>
        ) : (
          <div className="space-y-8">
            {rarityOrder.map((rarity) => {
              const items = byRarity[rarity];
              if (!items?.length) return null;
              return (
                <div key={rarity}>
                  <div className={`text-sm uppercase tracking-widest font-semibold mb-3 text-rarity-${rarity}`}>
                    {rarity}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items
                      .sort((a, b) => b.card.market_value_cents - a.card.market_value_cents)
                      .map((r) => (
                        <div key={r.id} className="glass rounded-2xl p-4 flex items-center gap-4">
                          <div className="w-14 h-20 rounded-lg bg-bg-elev overflow-hidden flex-shrink-0">
                            {r.card.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.card.image_url} alt={r.card.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full grid place-items-center text-2xl">🎴</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{r.card.name}</div>
                            <div className="text-xs text-white/50 truncate">{r.card.set_name}</div>
                            <div className="flex items-center justify-between mt-1">
                              <span className={`text-xs font-semibold text-rarity-${rarity}`}>
                                {formatOdds(r.weight, totalWeight)}
                              </span>
                              <span className="text-sm font-semibold">
                                {formatUSD(r.card.market_value_cents)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className="font-display text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
