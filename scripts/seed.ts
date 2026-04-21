#!/usr/bin/env tsx
/**
 * Seed the database with a starter card catalog and loot tables per tier.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed.ts
 *
 * Safe to re-run; upserts cards by external_id and rewards by (pack_id, card_id).
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(URL, KEY, { auth: { persistSession: false } });

type Card = {
  external_id: string;
  name: string;
  set_name: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
  market_value_cents: number;
  image_url?: string;
};

// Tiny curated seed catalog. Replace / extend with real scraping from
// pokemontcg.io or TCGplayer price data in production.
const CATALOG: Card[] = [
  { external_id: "seed-bulk-1", name: "Rattata (Common)",      set_name: "Starter Pool", rarity: "common",    market_value_cents: 10,    image_url: "https://images.pokemontcg.io/sv3/191.png" },
  { external_id: "seed-bulk-2", name: "Zubat (Common)",        set_name: "Starter Pool", rarity: "common",    market_value_cents: 10,    image_url: "https://images.pokemontcg.io/sv3/108.png" },
  { external_id: "seed-bulk-3", name: "Magikarp (Common)",     set_name: "Starter Pool", rarity: "common",    market_value_cents: 20,    image_url: "https://images.pokemontcg.io/sv3/38.png" },

  { external_id: "seed-uc-1",   name: "Machoke (Uncommon)",    set_name: "Starter Pool", rarity: "uncommon",  market_value_cents: 75,    image_url: "https://images.pokemontcg.io/sv3/101.png" },
  { external_id: "seed-uc-2",   name: "Haunter (Uncommon)",    set_name: "Starter Pool", rarity: "uncommon",  market_value_cents: 100,   image_url: "https://images.pokemontcg.io/sv3/111.png" },
  { external_id: "seed-uc-3",   name: "Staraptor (Uncommon)",  set_name: "Starter Pool", rarity: "uncommon",  market_value_cents: 150,   image_url: "https://images.pokemontcg.io/sv3/162.png" },

  { external_id: "seed-rare-1", name: "Gardevoir ex (Rare Holo)",   set_name: "Paldea Evolved", rarity: "rare", market_value_cents: 600,   image_url: "https://images.pokemontcg.io/sv2/86.png" },
  { external_id: "seed-rare-2", name: "Charmander (Rare)",          set_name: "151",            rarity: "rare", market_value_cents: 400,   image_url: "https://images.pokemontcg.io/sv3pt5/4.png" },
  { external_id: "seed-rare-3", name: "Pikachu (Rare Holo)",        set_name: "151",            rarity: "rare", market_value_cents: 750,   image_url: "https://images.pokemontcg.io/sv3pt5/25.png" },

  { external_id: "seed-epic-1", name: "Mew ex (Double Rare)",       set_name: "151",            rarity: "epic", market_value_cents: 2500,  image_url: "https://images.pokemontcg.io/sv3pt5/151.png" },
  { external_id: "seed-epic-2", name: "Iono (Illustration Rare)",   set_name: "Paldea Evolved", rarity: "epic", market_value_cents: 3800,  image_url: "https://images.pokemontcg.io/sv2/185.png" },
  { external_id: "seed-epic-3", name: "Roaring Moon ex (Double)",   set_name: "Paradox Rift",   rarity: "epic", market_value_cents: 3500,  image_url: "https://images.pokemontcg.io/sv4/124.png" },

  { external_id: "seed-leg-1",  name: "Charizard ex (Special Illustration Rare)", set_name: "Obsidian Flames", rarity: "legendary", market_value_cents: 25000, image_url: "https://images.pokemontcg.io/sv3/215.png" },
  { external_id: "seed-leg-2",  name: "Gardevoir ex (Special Illustration Rare)", set_name: "Paldea Evolved",  rarity: "legendary", market_value_cents: 18000, image_url: "https://images.pokemontcg.io/sv2/245.png" },
  { external_id: "seed-leg-3",  name: "Mew ex (Special Illustration Rare)",       set_name: "151",             rarity: "legendary", market_value_cents: 22000, image_url: "https://images.pokemontcg.io/sv3pt5/205.png" },

  { external_id: "seed-myth-1", name: "Umbreon VMAX Alt Art (PSA 10)",  set_name: "Evolving Skies", rarity: "mythic", market_value_cents: 350000, image_url: "https://images.pokemontcg.io/swsh7/215.png" },
  { external_id: "seed-myth-2", name: "Charizard UPC Gold",             set_name: "Ultra Premium",  rarity: "mythic", market_value_cents: 450000, image_url: "https://images.pokemontcg.io/swsh45-150.png" },
];

type Tier = {
  slug: string;
  rewards: Array<{ external_id: string; weight: number; max_supply?: number }>;
};

// Loot tables tuned for a ~75-85% expected-value-to-price ratio (house edge 15-25%).
// Tweak in admin/packs later.
const TIERS: Tier[] = [
  {
    slug: "tier-1",
    rewards: [
      { external_id: "seed-bulk-1", weight: 4500 },
      { external_id: "seed-bulk-2", weight: 3500 },
      { external_id: "seed-bulk-3", weight: 1500 },
      { external_id: "seed-uc-1",   weight: 350 },
      { external_id: "seed-uc-2",   weight: 130 },
      { external_id: "seed-rare-2", weight: 18 },
      { external_id: "seed-epic-1", weight: 1 }, // very rare chase
    ],
  },
  {
    slug: "tier-10",
    rewards: [
      { external_id: "seed-bulk-1", weight: 2000 },
      { external_id: "seed-bulk-2", weight: 1800 },
      { external_id: "seed-uc-1",   weight: 2200 },
      { external_id: "seed-uc-2",   weight: 1800 },
      { external_id: "seed-uc-3",   weight: 1200 },
      { external_id: "seed-rare-1", weight: 600 },
      { external_id: "seed-rare-2", weight: 350 },
      { external_id: "seed-rare-3", weight: 200 },
      { external_id: "seed-epic-1", weight: 40 },
      { external_id: "seed-epic-2", weight: 8 },
      { external_id: "seed-leg-1",  weight: 1 },
    ],
  },
  {
    slug: "tier-25",
    rewards: [
      { external_id: "seed-uc-2",   weight: 2000 },
      { external_id: "seed-uc-3",   weight: 1800 },
      { external_id: "seed-rare-1", weight: 2200 },
      { external_id: "seed-rare-2", weight: 1800 },
      { external_id: "seed-rare-3", weight: 1500 },
      { external_id: "seed-epic-1", weight: 400 },
      { external_id: "seed-epic-2", weight: 240 },
      { external_id: "seed-epic-3", weight: 180 },
      { external_id: "seed-leg-1",  weight: 25 },
      { external_id: "seed-leg-2",  weight: 15 },
      { external_id: "seed-leg-3",  weight: 10 },
      { external_id: "seed-myth-1", weight: 1 },
    ],
  },
  {
    slug: "tier-100",
    rewards: [
      { external_id: "seed-rare-1", weight: 1800 },
      { external_id: "seed-rare-2", weight: 1500 },
      { external_id: "seed-rare-3", weight: 1500 },
      { external_id: "seed-epic-1", weight: 2000 },
      { external_id: "seed-epic-2", weight: 1500 },
      { external_id: "seed-epic-3", weight: 1200 },
      { external_id: "seed-leg-1",  weight: 250 },
      { external_id: "seed-leg-2",  weight: 140 },
      { external_id: "seed-leg-3",  weight: 100 },
      { external_id: "seed-myth-1", weight: 8 },
      { external_id: "seed-myth-2", weight: 2 },
    ],
  },
];

async function main() {
  console.log("→ Upserting cards");
  const { data: cardRows, error: cardErr } = await supa
    .from("cards")
    .upsert(
      CATALOG.map((c) => ({
        external_id: c.external_id,
        name: c.name,
        set_name: c.set_name,
        rarity: c.rarity,
        image_url: c.image_url ?? null,
        market_value_cents: c.market_value_cents,
        market_value_source: "seed",
        market_value_updated_at: new Date().toISOString(),
      })),
      { onConflict: "external_id" },
    )
    .select("id, external_id");

  if (cardErr) throw cardErr;
  const cardByExt = new Map<string, string>();
  for (const r of cardRows ?? []) cardByExt.set(r.external_id, r.id);

  console.log("→ Creating a few physical units per card for inventory assignment");
  const unitRows: Array<{ card_id: string; location: string; condition: string }> = [];
  for (const [ext, id] of cardByExt) {
    // 10 units for rare+ cards, 100 for commons/uncommons.
    const tier = CATALOG.find((c) => c.external_id === ext)!.rarity;
    const n = tier === "common" || tier === "uncommon" ? 100 : tier === "mythic" ? 3 : 10;
    for (let i = 0; i < n; i++) {
      unitRows.push({
        card_id: id,
        location: "vault-seed",
        condition: "NM",
      });
    }
  }
  // Only seed units if none exist yet (otherwise re-running bloats the table).
  const { count } = await supa.from("card_units").select("id", { count: "exact", head: true });
  if ((count ?? 0) === 0) {
    // Supabase limits ~1000/batch
    for (let i = 0; i < unitRows.length; i += 500) {
      await supa.from("card_units").insert(unitRows.slice(i, i + 500));
    }
    console.log(`  inserted ${unitRows.length} units`);
  } else {
    console.log(`  skipped (${count} units already exist)`);
  }

  console.log("→ Wiring loot tables");
  const { data: packs } = await supa.from("packs").select("id, slug");
  const packBySlug = new Map<string, string>();
  for (const p of packs ?? []) packBySlug.set(p.slug, p.id);

  for (const t of TIERS) {
    const packId = packBySlug.get(t.slug);
    if (!packId) {
      console.warn(`  no pack for slug ${t.slug}, skipping`);
      continue;
    }
    const rows = t.rewards
      .map((r) => ({
        pack_id: packId,
        card_id: cardByExt.get(r.external_id),
        weight: r.weight,
        max_supply: r.max_supply ?? null,
      }))
      .filter((r) => r.card_id);
    const { error } = await supa.from("pack_rewards").upsert(rows, { onConflict: "pack_id,card_id" });
    if (error) throw error;

    // Compute EV & max payout.
    const totalW = rows.reduce((a, r) => a + r.weight, 0);
    const cardValues = new Map<string, number>();
    for (const c of CATALOG) cardValues.set(cardByExt.get(c.external_id)!, c.market_value_cents);
    const ev = rows.reduce(
      (acc, r) => acc + (r.weight / totalW) * (cardValues.get(r.card_id!) ?? 0),
      0,
    );
    const maxPayout = Math.max(...rows.map((r) => cardValues.get(r.card_id!) ?? 0));
    await supa
      .from("packs")
      .update({ expected_value_cents: Math.round(ev), max_payout_cents: maxPayout })
      .eq("id", packId);

    console.log(
      `  ${t.slug}: ${rows.length} rewards, EV $${(ev / 100).toFixed(2)}, max $${(maxPayout / 100).toFixed(2)}`,
    );
  }

  console.log("✓ Seed complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
