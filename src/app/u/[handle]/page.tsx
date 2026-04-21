import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";
import { RarityBar } from "@/components/rarity-bar";

export const revalidate = 30;

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `/u/${handle} — PokéRip`,
    description: `Flex profile for /u/${handle} on PokéRip. See their biggest pulls and stats.`,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const admin = createSupabaseAdmin();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, handle, display_name, created_at, public_profile")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();

  if (!profile || !profile.public_profile) notFound();

  const { data: openingsRaw } = await admin
    .from("openings")
    .select(
      "id, created_at, price_cents, payout_value_cents, pack:packs(slug, name), card:cards(name, rarity, image_url, set_name)",
    )
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(500);

  const openings = ((openingsRaw as unknown) as Array<{
    id: string;
    created_at: string;
    price_cents: number;
    payout_value_cents: number;
    pack: { slug: string; name: string };
    card: { name: string; rarity: Rarity; image_url: string | null; set_name: string | null };
  }>) ?? [];

  const rips = openings.length;
  const spent = openings.reduce((a, o) => a + Number(o.price_cents), 0);
  const pulled = openings.reduce((a, o) => a + Number(o.payout_value_cents), 0);

  const biggest = openings.reduce<typeof openings[number] | null>(
    (best, o) => (!best || Number(o.payout_value_cents) > Number(best.payout_value_cents) ? o : best),
    null,
  );

  const rarityCounts = RARITY_ORDER.reduce<Record<Rarity, number>>(
    (acc, r) => ((acc[r] = 0), acc),
    {} as Record<Rarity, number>,
  );
  for (const o of openings) rarityCounts[o.card.rarity] = (rarityCounts[o.card.rarity] ?? 0) + 1;

  // Top 6 hits (by value)
  const topHits = [...openings]
    .sort((a, b) => Number(b.payout_value_cents) - Number(a.payout_value_cents))
    .slice(0, 6);

  const displayName = profile.display_name || profile.handle;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="text-sm text-white/50">/u/{profile.handle}</div>
      <h1 className="font-display text-5xl font-black mt-1">
        <span className="shimmer-text">{displayName}</span>
      </h1>
      <div className="text-sm text-white/50 mt-1">
        Ripping since{" "}
        {new Date(profile.created_at).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })}
      </div>

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Rips" value={rips.toLocaleString()} />
        <Stat label="Spent" value={formatUSD(spent)} />
        <Stat label="Pulled" value={formatUSD(pulled)} />
        <Stat
          label="RTP"
          value={spent === 0 ? "—" : `${((pulled / spent) * 100).toFixed(0)}%`}
        />
      </div>

      {/* Biggest */}
      {biggest && (
        <section className="mt-10">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-3">Biggest pull</div>
          <div
            className="glass-strong rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-8"
            style={{ boxShadow: `0 0 100px -20px ${rarityGlow(biggest.card.rarity)}` }}
          >
            <div
              className="w-40 h-56 rounded-2xl overflow-hidden bg-bg-elev flex-shrink-0"
              style={{ boxShadow: `0 0 60px -10px ${rarityGlow(biggest.card.rarity)}` }}
            >
              {biggest.card.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={biggest.card.image_url} alt={biggest.card.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-6xl">🎴</div>
              )}
            </div>
            <div>
              <div className={`text-xs uppercase tracking-widest font-semibold text-rarity-${biggest.card.rarity}`}>
                {biggest.card.rarity}
              </div>
              <div className="font-display text-4xl font-black mt-1">{biggest.card.name}</div>
              <div className="text-white/50 text-sm mt-1">{biggest.card.set_name}</div>
              <div className="mt-3 text-2xl font-display font-bold">
                {formatUSD(biggest.payout_value_cents)}
              </div>
              <div className="text-xs text-white/40 mt-1">
                From {biggest.pack.name} on{" "}
                {new Date(biggest.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Top hits */}
      {topHits.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-bold mb-4">Top hits</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topHits.map((o) => (
              <div key={o.id} className="card-tile p-3 flex gap-3">
                <div className="w-14 h-20 bg-bg-elev rounded-md overflow-hidden flex-shrink-0">
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
                  <div className="text-sm font-semibold mt-1">
                    {formatUSD(o.payout_value_cents)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Rarity breakdown */}
      {rips > 0 && (
        <section className="mt-10 glass rounded-2xl p-6">
          <h2 className="font-display text-2xl font-bold mb-4">Rarity breakdown</h2>
          <div className="space-y-3">
            {RARITY_ORDER.map((r) => (
              <RarityBar
                key={r}
                rarity={r}
                count={rarityCounts[r]}
                percentage={rips > 0 ? (rarityCounts[r] / rips) * 100 : 0}
              />
            ))}
          </div>
        </section>
      )}

      <div className="mt-12 text-center text-white/50 text-sm">
        Think you can do better?{" "}
        <Link href="/packs" className="text-brand underline">
          Rip your own pack →
        </Link>
      </div>
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
