import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";
import { RarityBar } from "@/components/rarity-bar";
import { ProfileSettings } from "@/components/profile-settings";
import { ShareButton } from "@/components/share-button";

export const dynamic = "force-dynamic";

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

type OpeningRow = {
  id: string;
  created_at: string;
  price_cents: number;
  payout_value_cents: number;
  pack: { slug: string; name: string };
  card: { name: string; rarity: Rarity; image_url: string | null; set_name: string | null };
};

const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();

  const [{ data: profile }, { data: wallet }, { data: openingsRaw }, { data: heldRaw }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, email, display_name, handle, public_profile, created_at")
        .eq("id", user.id)
        .maybeSingle(),
      admin
        .from("wallets")
        .select("balance_cents, lifetime_deposit_cents, lifetime_withdraw_cents")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("openings")
        .select(
          "id, created_at, price_cents, payout_value_cents, pack:packs(slug, name), card:cards(name, rarity, image_url, set_name)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500),
      admin
        .from("card_units")
        .select("card:cards(market_value_cents, rarity)")
        .eq("owned_by_user", user.id)
        .eq("state", "held"),
    ]);

  const openings = ((openingsRaw as unknown) as OpeningRow[] | null) ?? [];
  const held = ((heldRaw as unknown) as Array<{ card: { market_value_cents: number; rarity: Rarity } }> | null) ?? [];

  // -- Lifetime aggregates --
  const ripCount = openings.length;
  const totalSpent = openings.reduce((acc, o) => acc + Number(o.price_cents), 0);
  const totalValue = openings.reduce((acc, o) => acc + Number(o.payout_value_cents), 0);
  const netPL = totalValue - totalSpent;

  // -- Biggest pull --
  const biggest = openings.reduce<OpeningRow | null>(
    (best, o) => (!best || Number(o.payout_value_cents) > Number(best.payout_value_cents) ? o : best),
    null,
  );

  // -- Best profit rip (payout - price) --
  const bestRoi = openings.reduce<OpeningRow | null>(
    (best, o) => {
      const delta = Number(o.payout_value_cents) - Number(o.price_cents);
      const bestDelta = best ? Number(best.payout_value_cents) - Number(best.price_cents) : -Infinity;
      return delta > bestDelta ? o : best;
    },
    null,
  );

  // -- Rarity distribution (all pulls) --
  const rarityCounts = RARITY_ORDER.reduce<Record<Rarity, number>>(
    (acc, r) => ((acc[r] = 0), acc),
    {} as Record<Rarity, number>,
  );
  for (const o of openings) {
    rarityCounts[o.card.rarity] = (rarityCounts[o.card.rarity] ?? 0) + 1;
  }

  // -- Held inventory value --
  const heldValue = held.reduce((acc, h) => acc + Number(h.card.market_value_cents), 0);

  // -- Streak stats: current "hot streak" of consecutive +EV rips --
  let currentHotStreak = 0;
  for (const o of openings) {
    if (Number(o.payout_value_cents) > Number(o.price_cents)) currentHotStreak++;
    else break;
  }

  // -- Favorite pack --
  const packCounts = new Map<string, { name: string; slug: string; n: number; spend: number }>();
  for (const o of openings) {
    const key = o.pack.slug;
    const cur = packCounts.get(key) ?? { name: o.pack.name, slug: o.pack.slug, n: 0, spend: 0 };
    cur.n++;
    cur.spend += Number(o.price_cents);
    packCounts.set(key, cur);
  }
  const favoritePack = [...packCounts.values()].sort((a, b) => b.n - a.n)[0];

  // -- Rarest rarity pulled (for flex) --
  const rarestPulled = RARITY_ORDER.slice()
    .reverse()
    .find((r) => rarityCounts[r] > 0) ?? null;

  const displayName =
    profile?.display_name ||
    profile?.handle ||
    (profile?.email ? profile.email.split("@")[0] : "Ripper");

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Header */}
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-sm text-white/50">Welcome back,</div>
          <h1 className="font-display text-4xl md:text-5xl font-black">
            <span className="shimmer-text">{displayName}</span>
          </h1>
          <div className="text-sm text-white/50 mt-1">
            Rolling since{" "}
            {profile?.created_at
              ? new Date(profile.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric",
                })
              : "today"}
          </div>
        </div>
        <div className="flex gap-2">
          <ShareButton
            handle={profile?.handle ?? null}
            publicProfile={profile?.public_profile ?? false}
          />
          <Link href="/packs" className="btn-primary">
            Rip more →
          </Link>
        </div>
      </header>

      {/* Hero stat cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HeroStat
          label="Lifetime rips"
          value={ripCount.toLocaleString()}
          sub={ripCount === 0 ? "Rip one to get started" : `${currentHotStreak} hot streak 🔥`}
          accent="cyan"
        />
        <HeroStat
          label="Total spent"
          value={formatUSD(totalSpent)}
          sub={favoritePack ? `Fav: ${favoritePack.name}` : "—"}
        />
        <HeroStat
          label="Total value pulled"
          value={formatUSD(totalValue)}
          sub={`${formatUSD(heldValue)} still held`}
        />
        <HeroStat
          label="Net P&L"
          value={`${netPL >= 0 ? "+" : ""}${formatUSD(netPL)}`}
          sub={
            totalSpent === 0
              ? "—"
              : `${((totalValue / Math.max(1, totalSpent)) * 100).toFixed(0)}% RTP`
          }
          accent={netPL >= 0 ? "cyan" : "pink"}
        />
      </div>

      {/* Biggest pull showcase */}
      {biggest && (
        <section className="mt-10">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-3">
            Biggest pull of all time
          </div>
          <div
            className="glass-strong rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-8"
            style={{
              boxShadow: `0 0 100px -20px ${rarityGlow(biggest.card.rarity)}`,
            }}
          >
            <div
              className="w-44 h-60 rounded-2xl overflow-hidden bg-bg-elev flex-shrink-0"
              style={{ boxShadow: `0 0 60px -10px ${rarityGlow(biggest.card.rarity)}` }}
            >
              {biggest.card.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={biggest.card.image_url}
                  alt={biggest.card.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full grid place-items-center text-6xl">🎴</div>
              )}
            </div>
            <div className="flex-1 min-w-0 text-center md:text-left">
              <div
                className={`text-xs uppercase tracking-widest font-semibold text-rarity-${biggest.card.rarity}`}
              >
                {biggest.card.rarity}
              </div>
              <div className="font-display text-3xl md:text-4xl font-black mt-1 truncate">
                {biggest.card.name}
              </div>
              <div className="text-white/50 text-sm mt-1">{biggest.card.set_name}</div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Kv label="Worth" value={formatUSD(biggest.payout_value_cents)} />
                <Kv label="From" value={biggest.pack.name} />
                <Kv
                  label="Rip cost"
                  value={formatUSD(biggest.price_cents)}
                />
              </div>
              <div className="mt-3 text-xs text-white/40">
                Pulled {new Date(biggest.created_at).toLocaleDateString()} · #{biggest.id.slice(0, 8)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Rarity breakdown + Best ROI rip */}
      <section className="mt-10 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="font-display text-xl font-bold">Rarity breakdown</div>
            {rarestPulled && (
              <div className={`chip text-rarity-${rarestPulled}`}>
                Rarest pulled: {rarestPulled}
              </div>
            )}
          </div>
          {ripCount === 0 ? (
            <div className="text-white/50 text-sm py-10 text-center">
              Rip a pack to start filling this in.
            </div>
          ) : (
            <div className="space-y-3">
              {RARITY_ORDER.map((r) => {
                const n = rarityCounts[r];
                const pct = ripCount > 0 ? (n / ripCount) * 100 : 0;
                return <RarityBar key={r} rarity={r} count={n} percentage={pct} />;
              })}
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="font-display text-xl font-bold mb-4">Best ROI rip</div>
          {bestRoi ? (
            <div className="flex gap-4 items-start">
              <div className="w-20 h-28 rounded-xl overflow-hidden bg-bg-elev flex-shrink-0">
                {bestRoi.card.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bestRoi.card.image_url} alt={bestRoi.card.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-3xl">🎴</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{bestRoi.card.name}</div>
                <div className={`text-xs text-rarity-${bestRoi.card.rarity}`}>
                  {bestRoi.card.rarity}
                </div>
                <div className="mt-2 text-sm">
                  Spent{" "}
                  <span className="font-semibold">{formatUSD(bestRoi.price_cents)}</span>, pulled{" "}
                  <span className="font-semibold text-accent-cyan">
                    {formatUSD(bestRoi.payout_value_cents)}
                  </span>
                </div>
                <div className="text-xs text-white/40 mt-1">
                  +{formatUSD(Number(bestRoi.payout_value_cents) - Number(bestRoi.price_cents))}{" "}
                  profit on this one
                </div>
              </div>
            </div>
          ) : (
            <div className="text-white/50 text-sm">No rips yet.</div>
          )}
        </div>
      </section>

      {/* Recent activity */}
      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-bold">Recent rips</h2>
          {openings.length > 0 && (
            <Link href="/inventory" className="text-sm text-brand hover:underline">
              Full inventory →
            </Link>
          )}
        </div>
        {openings.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center text-white/50">
            You haven&apos;t ripped anything yet.{" "}
            <Link href="/packs" className="text-brand underline">
              Start with a dollar pack
            </Link>
            .
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {openings.slice(0, 12).map((o) => {
              const delta = Number(o.payout_value_cents) - Number(o.price_cents);
              return (
                <Link
                  key={o.id}
                  href={`/fairness/${o.id}`}
                  className="card-tile p-3 flex items-center gap-3"
                >
                  <div className="w-12 h-16 bg-bg-elev rounded-md overflow-hidden flex-shrink-0">
                    {o.card.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={o.card.image_url}
                        alt={o.card.name}
                        className="w-full h-full object-cover"
                      />
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
                      <span className="text-white/40">{o.pack.slug}</span>
                      <span className={delta >= 0 ? "text-accent-cyan" : "text-white/40"}>
                        {delta >= 0 ? "+" : ""}
                        {formatUSD(delta)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Profile / handle settings */}
      <section id="profile-settings" className="mt-12 scroll-mt-20">
        <h2 className="font-display text-2xl font-bold mb-4">Profile & flex settings</h2>
        <ProfileSettings
          initialDisplayName={profile?.display_name ?? ""}
          initialHandle={profile?.handle ?? ""}
          initialPublic={profile?.public_profile ?? false}
        />
      </section>
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "cyan" | "pink";
}) {
  const color =
    accent === "cyan" ? "text-accent-cyan" : accent === "pink" ? "text-accent-pink" : "text-white";
  return (
    <div className="glass-strong rounded-2xl p-5">
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className={`font-display text-3xl font-black mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-white/50 mt-1">{sub}</div>}
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-white/40">{label}</div>
      <div className="font-semibold text-sm truncate">{value}</div>
    </div>
  );
}

function rarityGlow(r: Rarity): string {
  return {
    common: "#b0b0b0",
    uncommon: "#5ce1a7",
    rare: "#5ab0ff",
    epic: "#b86cff",
    legendary: "#ffb84d",
    mythic: "#ff4d6d",
  }[r];
}
