-- ============================================================
-- PokéRip — Postgres schema (Supabase-compatible)
-- ============================================================
-- Run this against your Supabase project:
--   psql "$DATABASE_URL" -f db/schema.sql
-- It is idempotent (safe to re-run).
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------- Enums ----------
do $$ begin
  create type rarity as enum ('common','uncommon','rare','epic','legendary','mythic');
exception when duplicate_object then null; end $$;

do $$ begin
  create type txn_kind as enum (
    'deposit','withdrawal','pack_purchase','pack_refund',
    'sellback_credit','shipping_fee','adjustment','bonus'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type txn_status as enum ('pending','succeeded','failed','canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type inventory_state as enum ('held','ship_requested','shipped','sold_back','voided');
exception when duplicate_object then null; end $$;

do $$ begin
  create type shipment_status as enum ('requested','packed','shipped','delivered','returned','canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payout_status as enum ('pending','processing','paid','failed','canceled');
exception when duplicate_object then null; end $$;

-- ---------- Users ----------
-- Supabase creates auth.users. We extend with a public profile table.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext unique not null,
  display_name text,
  date_of_birth date,                       -- for age gate (>= 18 / 21 depending on state)
  kyc_verified boolean not null default false,
  stripe_customer_id text unique,           -- for deposits
  stripe_account_id text unique,            -- Connect Express account (for ACH payouts)
  role text not null default 'user',        -- 'user' | 'admin' | 'support'
  blocked boolean not null default false,
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);

-- ---------- Wallets ----------
-- All amounts stored in integer CENTS to avoid floating-point bugs.
create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  locked_cents bigint not null default 0 check (locked_cents >= 0),
  lifetime_deposit_cents bigint not null default 0,
  lifetime_withdraw_cents bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------- Ledger (immutable transactions) ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind txn_kind not null,
  status txn_status not null default 'succeeded',
  amount_cents bigint not null,             -- signed: positive = credit to user, negative = debit
  balance_after_cents bigint not null,      -- snapshot for auditability
  reference_type text,                      -- 'pack_opening' | 'stripe_payment' | 'stripe_payout' | ...
  reference_id text,                        -- fk id or external id (e.g. pi_xxx)
  memo text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_user on public.transactions(user_id, created_at desc);
create index if not exists idx_transactions_ref on public.transactions(reference_type, reference_id);

-- ---------- Card catalog ----------
-- Master list of every card we can give out. Inventory tracks physical units.
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,                  -- e.g. pokemontcg.io id "sv3-199"
  name text not null,
  set_code text,
  set_name text,
  card_number text,
  rarity rarity not null default 'common',
  image_url text,
  market_value_cents bigint not null default 0,   -- current estimated value (cents)
  market_value_source text,
  market_value_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cards_rarity on public.cards(rarity);
create index if not exists idx_cards_value on public.cards(market_value_cents desc);

-- ---------- Pack tiers ($1, $10, $25, $100) ----------
create table if not exists public.packs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                -- 'tier-1', 'tier-10', etc.
  name text not null,                       -- 'Pocket Rip', 'Holo Heaven', 'The Whale'
  price_cents bigint not null check (price_cents > 0),
  tagline text,
  description text,
  hero_image_url text,
  theme_color text,                         -- hex, used in the opening animation
  -- House economics
  expected_value_cents bigint not null default 0,   -- computed server-side from loot table
  max_payout_cents bigint not null default 0,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Loot tables ----------
-- One row per possible reward in a pack. Weights are integers (any scale).
-- Probability = weight / sum(weights in pack).
create table if not exists public.pack_rewards (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete restrict,
  weight bigint not null check (weight > 0),
  -- Optional inventory cap: if set, pulls that would exceed this stop.
  max_supply int,
  awarded_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (pack_id, card_id)
);

create index if not exists idx_pack_rewards_pack on public.pack_rewards(pack_id);

-- ---------- Physical inventory (unit-level) ----------
-- Each row is one physical card in the vault. When a user pulls, we assign a unit.
create table if not exists public.card_units (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete restrict,
  serial text unique,                       -- optional internal SKU / barcode
  location text,                            -- 'vault-A-12', 'shipped', etc.
  condition text,                           -- 'NM', 'LP', 'graded-PSA10', ...
  grade text,
  acquired_cost_cents bigint,               -- what we paid for it (for COGS)
  state inventory_state not null default 'held',
  owned_by_user uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_units_card on public.card_units(card_id);
create index if not exists idx_units_state on public.card_units(state);
create index if not exists idx_units_owner on public.card_units(owned_by_user);

-- ---------- Server seeds (provably-fair) ----------
-- We commit sha256(server_seed) publicly BEFORE a pull, reveal seed AFTER.
create table if not exists public.server_seeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  seed_hash text not null,                  -- sha256 hex of server_seed (public pre-roll)
  seed_plain text,                          -- revealed only after all uses exhausted or rotated
  nonce int not null default 0,             -- increments with each use
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revealed_at timestamptz
);

create index if not exists idx_seeds_user_active on public.server_seeds(user_id) where active;

-- ---------- Openings (one row per pack ripped) ----------
create table if not exists public.openings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pack_id uuid not null references public.packs(id) on delete restrict,
  price_cents bigint not null,

  -- Provably-fair fields
  server_seed_id uuid not null references public.server_seeds(id),
  server_seed_hash text not null,           -- copy at time of roll
  client_seed text not null,                -- user-controlled (or defaulted)
  nonce int not null,                       -- monotonically increasing per server_seed
  roll_hash text not null,                  -- hmac_sha256(server_seed, client_seed:nonce)
  roll_value numeric(20,18) not null,       -- normalized [0,1)

  -- Result
  reward_id uuid not null references public.pack_rewards(id),
  card_id uuid not null references public.cards(id),
  card_unit_id uuid references public.card_units(id),   -- which physical unit assigned
  payout_value_cents bigint not null,       -- card market value at time of pull

  created_at timestamptz not null default now()
);

create index if not exists idx_openings_user on public.openings(user_id, created_at desc);
create index if not exists idx_openings_pack on public.openings(pack_id, created_at desc);

-- ---------- Shipments ----------
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  line1 text not null,
  line2 text,
  city text not null,
  region text not null,                     -- state / province
  postal_code text not null,
  country text not null default 'US',
  phone text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  address_id uuid not null references public.addresses(id),
  status shipment_status not null default 'requested',
  carrier text,
  tracking_number text,
  label_url text,
  shipping_fee_cents bigint not null default 0,
  insured_value_cents bigint not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipment_items (
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  card_unit_id uuid not null references public.card_units(id),
  primary key (shipment_id, card_unit_id)
);

-- ---------- Payouts (ACH via Stripe Connect) ----------
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  status payout_status not null default 'pending',
  stripe_transfer_id text unique,
  stripe_payout_id text unique,
  failure_reason text,
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_payouts_user on public.payouts(user_id, requested_at desc);

-- ---------- Audit log ----------
create table if not exists public.audit_log (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_user on public.audit_log(user_id, created_at desc);
create index if not exists idx_audit_action on public.audit_log(action, created_at desc);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles       enable row level security;
alter table public.wallets        enable row level security;
alter table public.transactions   enable row level security;
alter table public.openings       enable row level security;
alter table public.card_units     enable row level security;
alter table public.addresses      enable row level security;
alter table public.shipments      enable row level security;
alter table public.payouts        enable row level security;
alter table public.server_seeds   enable row level security;

-- Cards / packs / pack_rewards are public read
alter table public.cards          enable row level security;
alter table public.packs          enable row level security;
alter table public.pack_rewards   enable row level security;

drop policy if exists "public read cards"        on public.cards;
drop policy if exists "public read packs"        on public.packs;
drop policy if exists "public read pack_rewards" on public.pack_rewards;
create policy "public read cards"        on public.cards        for select using (true);
create policy "public read packs"        on public.packs        for select using (active);
create policy "public read pack_rewards" on public.pack_rewards for select using (true);

-- Users can read their own row from each private table
drop policy if exists "self read profile"   on public.profiles;
drop policy if exists "self read wallet"    on public.wallets;
drop policy if exists "self read txns"      on public.transactions;
drop policy if exists "self read openings"  on public.openings;
drop policy if exists "self read units"     on public.card_units;
drop policy if exists "self read addresses" on public.addresses;
drop policy if exists "self read shipments" on public.shipments;
drop policy if exists "self read payouts"   on public.payouts;
drop policy if exists "self read seeds"     on public.server_seeds;

create policy "self read profile"   on public.profiles      for select using (auth.uid() = id);
create policy "self read wallet"    on public.wallets       for select using (auth.uid() = user_id);
create policy "self read txns"      on public.transactions  for select using (auth.uid() = user_id);
create policy "self read openings"  on public.openings      for select using (auth.uid() = user_id);
create policy "self read units"     on public.card_units    for select using (auth.uid() = owned_by_user);
create policy "self read addresses" on public.addresses     for select using (auth.uid() = user_id);
create policy "self read shipments" on public.shipments     for select using (auth.uid() = user_id);
create policy "self read payouts"   on public.payouts       for select using (auth.uid() = user_id);
create policy "self read seeds"     on public.server_seeds  for select using (auth.uid() = user_id);

-- Users can insert their own addresses
drop policy if exists "self insert addresses" on public.addresses;
drop policy if exists "self update addresses" on public.addresses;
create policy "self insert addresses" on public.addresses for insert with check (auth.uid() = user_id);
create policy "self update addresses" on public.addresses for update using (auth.uid() = user_id);

-- Writes to wallets/openings/transactions/etc are always done via the service role
-- (server routes using SUPABASE_SERVICE_ROLE_KEY bypass RLS).

-- ============================================================
-- Seed pack tiers
-- ============================================================
insert into public.packs (slug, name, price_cents, tagline, description, theme_color, sort_order)
values
  ('tier-1',   'Pocket Rip',  100,   'A dollar and a dream.',            'Entry-level pulls. Mostly commons, tiny chance of something spicy.', '#5ab0ff', 1),
  ('tier-10',  'Holo Hunt',   1000,  'Chase the shine.',                 'Balanced odds. Holos regularly; chase cards occasionally.',          '#b86cff', 2),
  ('tier-25',  'Alt-Art Alley', 2500, 'Where the chase cards live.',     'Serious odds of alternate-arts and full-arts. Rip responsibly.',     '#ff2d95', 3),
  ('tier-100', 'The Whale',   10000, '$100. One rip. Life-changing pulls.', 'Maximum variance. Vault-tier chase cards on the line.',             '#ffb84d', 4)
on conflict (slug) do nothing;
