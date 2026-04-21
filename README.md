<div align="center">

# PokéRip

**CSGO-style case-opening for Pokémon cards — provably fair, with real cash-out and physical shipment.**

Pick a tier. Rip a virtual pack against a weighted loot table. Then either **ship the physical card to your door** or **cash out via ACH**. Every roll is cryptographically verifiable.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ecf8e?logo=supabase&logoColor=white)](https://supabase.com)
[![Stripe](https://img.shields.io/badge/Stripe-Checkout%20%2B%20Connect-635bff?logo=stripe&logoColor=white)](https://stripe.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)

</div>

---

## ⚠️ Legal reality check — READ FIRST

Real-money case/pack opening with a cash-out path is treated as **gambling** in many US states and regulatory regimes. Washington State has already sued operators of sites with exactly this business model. Before pointing this at the public internet, **you must:**

1. **Retain a gambling / sweepstakes attorney.** Not optional. This is not generic e-commerce.
2. **Geo-block** disallowed states and countries. Scaffolded in `src/middleware.ts` via `BLOCKED_US_STATES` + `ALLOWED_COUNTRIES`. Your lawyer will hand you the full list.
3. **Enforce KYC on payouts.** Stripe Connect Express does this automatically on onboarding.
4. **Age-gate.** 18+ minimum, 21+ in some jurisdictions. Scaffolded at `/age-gate`.
5. **Publish loot-table odds publicly.** `/packs/[slug]` already does this and `/fairness` explains the system.
6. Provide **responsible-play disclosures, deposit/session limits, and a self-exclusion mechanism.** Stub for you to finish.
7. Be aware this codebase does **not** currently enforce things like daily loss limits, cooling-off periods, or problem-gambling referrals. Those are table stakes for any jurisdiction where you plan to actually operate.

This repo is a **functional foundation**, not a shrink-wrapped license to print money. Running it in production without proper counsel and compliance is on you.

---

## Table of contents

- [What's here](#whats-here)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Feature tour](#feature-tour)
- [Setup (local dev)](#setup-local-dev)
- [Environment variables](#environment-variables)
- [Database schema](#database-schema)
- [Provably-fair RNG](#provably-fair-rng)
- [Stripe integration](#stripe-integration)
- [Admin dashboard](#admin-dashboard)
- [Economics & tuning](#economics--tuning)
- [Project layout](#project-layout)
- [Common tasks](#common-tasks)
- [Deployment](#deployment)
- [Roadmap / known gaps](#roadmap--known-gaps)
- [License](#license)

---

## What's here

- **Landing + pack catalog** with published odds and a signature-animated hero.
- **CSGO-style horizontal-reel reveal** using Framer Motion, pre-ordered by rarity so the stopping card lands dead-center with the right slow-down curve.
- **Provably-fair RNG** — HMAC-SHA256 with client-seed / server-seed commit-reveal, verifiable in the browser using WebCrypto.
- **Wallet + activity ledger** with Stripe Checkout deposits and Stripe Connect Express ACH payouts (KYC included).
- **Inventory** — multi-select sell-back to the house at a configurable rate, or request physical shipment with insured mail.
- **Age-gate + country / US-state geo-block middleware.**
- **Public "flex" profile** at `/u/[handle]` so winners can share hauls; opt-in via dashboard settings.
- **Personal dashboard** at `/dashboard` — lifetime P&L, biggest pull, rarity breakdown, hot streak.
- **Full admin dashboard** — KPIs, revenue charts, marketing funnel, retention, per-pack RTP vs designed, rarity actuals, user search + detail, wallet adjustments with audit trail, inventory levels, payout review queue.

---

## Architecture

```
┌──────────────────┐       ┌───────────────────────────┐       ┌──────────────────┐
│   Next.js 15     │──────▶│  Supabase (Postgres + Auth)│◀──────│  Stripe webhooks │
│   App Router     │       │  - Row Level Security      │       │ deposits/payouts │
│   RSC + API      │       │  - Atomic SQL RPCs         │       └──────────────────┘
│   Framer Motion  │       │    open_pack()             │
└──────────────────┘       │    credit_wallet()         │
        │                  │    request_payout()        │
        │                  │    sellback_card()         │
        │                  │    adjust_wallet()  (admin)│
        ▼                  └───────────────────────────┘
 Browser WebCrypto                    ▲
 fairness verifier                    │
                       commit/reveal via server_seeds table
```

**Key design choices**

- **Atomic game logic lives in Postgres stored procedures.** A rip has to: lock the user's wallet row, debit price, pick a weighted reward, allocate a specific unowned inventory unit, write a transaction ledger entry, and return the result. Doing that across a round-trip from Node opens race conditions. Instead we call `open_pack(...)` as a single `SECURITY DEFINER` function so the transaction succeeds or rolls back atomically.
- **Service-role clients only run server-side.** The `SUPABASE_SERVICE_ROLE_KEY` is never shipped to the browser. Public reads go through RLS via the anon key.
- **Three Supabase clients**: browser (`lib/supabase/client.ts`), server-with-cookies (`lib/supabase/server.ts → createSupabaseServer`), service-role (`createSupabaseAdmin`). Pick the minimum power you need.
- **Zod-validated env** (`lib/env.ts`) — boot-time fail-fast on missing config.
- **Idempotent webhooks** — every deposit has a `reference_type + reference_id` unique constraint in `transactions`. Stripe replays are safe.

---

## Tech stack

| Layer      | Choice                                                               |
|------------|----------------------------------------------------------------------|
| Framework  | Next.js 15 (App Router, React 19, Server Components)                 |
| Language   | TypeScript 5                                                         |
| UI         | Tailwind CSS + custom dark theme, Framer Motion, Lucide icons        |
| Data       | Supabase (Postgres + Auth + Row Level Security)                      |
| Auth       | Email+password and Google OAuth via Supabase Auth                    |
| Payments   | Stripe Checkout (deposits); Stripe Connect Express (ACH payouts)     |
| RNG        | `node:crypto` HMAC-SHA256, verified in-browser via `window.crypto.subtle` |
| Validation | Zod (API bodies + env)                                               |
| Charts     | Custom zero-dep SVG sparkline + bar chart                            |

---

## Feature tour

### Player flow

- `/` — hero, four pack tiers (`$1 / $10 / $25 / $100`), global live-hits feed.
- `/packs` — catalog.
- `/packs/[slug]` — published loot table with exact weights / odds / EV.
- `/login` + `/signup` — email+password and Google OAuth.
- `/wallet` — balance, deposit via Stripe Checkout, full transaction ledger.
- **Rip** — atomic `POST /api/packs/open` hits the RPC, server returns the commit-reveal tuple + the pulled card, client runs the reel animation, then the card lands in inventory.
- `/inventory` — held cards. Per card: **sell back** (default 70% of market), **ship to door** (insured — fee derived from declared value).
- `/payouts` — Stripe Connect Express onboarding, then ACH cash-out.
- `/fairness` — explainer + in-browser WebCrypto verifier; rotates the server seed on demand (reveals the old seed, commits to a new one).
- `/dashboard` — personal stats: lifetime rips, net P&L, biggest pull, rarity breakdown, hot streak, profile settings.
- `/u/[handle]` — public "flex" profile (opt-in via dashboard).

### Admin flow (role-gated by `ADMIN_EMAILS`)

- `/admin` — overview. KPIs with WoW deltas, 30-day sparklines, pending payouts + shipment queues, pack performance (actual vs designed RTP), biggest pulls of all time.
- `/admin/analytics` — acquisition funnel (Signups → Deposits → Rips → Payouts), D1/D7/D30 activation, WAU, deposit-size distribution, ARPU/ARPPU.
- `/admin/economics` — per-pack deep dive: designed vs actual RTP, rarity distribution actuals vs weights, top hits.
- `/admin/users` — searchable list, sortable by newest / top spenders / biggest wallet / recently active.
- `/admin/users/[id]` — full user detail + **wallet adjust** (ledgered, audit-logged, capped) + block/unblock.
- `/admin/inventory` — stock levels; out-of-stock non-common cards flagged.
- `/admin/payouts` — pending queue with **cancel + refund** (atomic via `admin_cancel_payout` RPC).
- `/admin/openings`, `/admin/packs`, `/admin/packs/[slug]`, `/admin/shipments` — raw logs + loot-table viewer + shipping queue.

---

## Setup (local dev)

### Prerequisites

- Node.js 20+ and npm
- A free **Supabase** project
- A **Stripe** account (test mode is fine)
- The **Stripe CLI** (`stripe listen` for webhook forwarding)

### 1. Clone and install

```bash
git clone https://github.com/g8tsz/PokeRIP.git
cd PokeRIP
npm install
```

### 2. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **Settings → API**: copy `URL`, anon key, service role key.
3. **Settings → Database → Connection string (URI)**: copy as `DATABASE_URL`.
4. Apply the schema + functions + the admin analytics migration:

   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   psql "$DATABASE_URL" -f db/functions.sql
   psql "$DATABASE_URL" -f db/migrations/001_profile_handle.sql
   psql "$DATABASE_URL" -f db/migrations/002_admin_analytics.sql
   ```

   (On Windows without psql you can paste these into the Supabase SQL Editor.)

5. **Authentication → Providers**: enable Email. Optionally enable Google.
6. **Authentication → URL Configuration**: add `http://localhost:3000/auth/callback` to the redirect allow-list.

### 3. Stripe

1. [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → API keys** → copy `sk_test_...` and `pk_test_...`.
2. **Connect → Settings** → enable Connect → copy the `ca_...` client ID.
3. In a second terminal, start the webhook tunnel:

   ```bash
   stripe listen --forward-to localhost:3000/api/webhook/stripe
   ```

   Paste the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

### 4. Environment

```bash
cp .env.example .env.local
```

Fill in every variable. Generate `RNG_MASTER_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add your email to `ADMIN_EMAILS` to unlock `/admin`.

### 5. Seed

```bash
npm run db:seed
```

Upserts a small sample card catalog + weighted loot tables for the four pack tiers. `expected_value_cents` and `max_payout_cents` are auto-computed from the loot table.

### 6. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up, drop a test deposit (use Stripe's `4242 4242 4242 4242` test card), and rip.

---

## Environment variables

All validated by Zod at boot (`src/lib/env.ts`). Missing or malformed values will crash the server with a clear message.

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL`            | ✅ | Absolute URL of the deployment, used for Stripe return URLs |
| `NEXT_PUBLIC_SUPABASE_URL`       | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | ✅ | Browser / RLS-scoped reads |
| `SUPABASE_SERVICE_ROLE_KEY`      | ✅ | **Server-only.** Bypasses RLS. Never expose. |
| `DATABASE_URL`                   | ✅ | Postgres URI for migrations and scripts |
| `STRIPE_SECRET_KEY`              | ✅ | Stripe API key (test or live) |
| `STRIPE_PUBLISHABLE_KEY`         | ✅ | Client-safe key |
| `STRIPE_WEBHOOK_SECRET`          | ✅ | `whsec_...` from `stripe listen` or the dashboard |
| `STRIPE_CONNECT_CLIENT_ID`       | ✅ | `ca_...` for Connect Express onboarding |
| `RNG_MASTER_SECRET`              | ✅ | 64 hex chars. Seed rotation secret. |
| `ADMIN_EMAILS`                   | ✅ | Comma-separated. Emails in this list unlock `/admin`. |
| `BLOCKED_US_STATES`              | ✅ | Comma-separated 2-letter codes. Visitors from these states are routed to `/unavailable`. |
| `ALLOWED_COUNTRIES`              | ✅ | Comma-separated 2-letter ISO. Everything else is blocked. |

---

## Database schema

Everything lives in the `public` schema of your Supabase project. All tables have RLS enabled; public clients only see rows that belong to them (or are marked opt-in public, like `/u/[handle]`).

| Table               | Purpose |
|---------------------|---------|
| `profiles`          | Mirrors `auth.users`. Handle, display name, `blocked`, `kyc_verified`, `public_profile` opt-in. |
| `wallets`           | Balance + lifetime deposit/withdraw counters. One row per user. |
| `packs`             | The four tiers. Price, computed EV, max payout, sort order. |
| `cards`             | Catalog of Pokémon cards with rarity + market value. |
| `pack_rewards`      | Join table: `(pack_id, card_id, weight, max_supply, awarded_count)`. The loot table. |
| `card_units`        | Physical inventory — one row per copy. State machine: `held → allocated → ship_requested → shipped`, plus `sold_back` and `voided`. |
| `openings`          | Every rip: pack, card pulled, price, payout value, commit/reveal seeds + roll hash. |
| `transactions`      | The ledger. `kind ∈ {deposit, withdrawal, pack_spend, payout_hold, sellback_credit, shipping_fee, adjustment, bonus}`. Idempotent by `(reference_type, reference_id)`. |
| `addresses`         | User shipping addresses. |
| `shipments`         | A batched shipment request bundling one or more `card_units`. |
| `payouts`           | An ACH payout request. Flows pending → paid/failed/canceled. |
| `server_seeds`      | One active seed per user. On reveal, old seed moves to `revealed_at` and a new one is committed. |
| `audit_log`         | Admin actions — wallet adjusts, user flags, payout cancels. |

Views (from `db/migrations/002_admin_analytics.sql`):

| View                   | What |
|------------------------|------|
| `v_daily_metrics`      | 90-day per-day signups / rips / DAU / revenue / deposits / withdrawals |
| `v_pack_performance`   | Lifetime per-pack rips, gross, value awarded, **actual RTP %** |
| `v_user_metrics`       | Per-user leaderboard: wallet, rips, spent, pulled, last active |
| `v_card_inventory`     | Per-card stock levels split by state |

SQL RPCs (`SECURITY DEFINER`):

| Function | Purpose |
|---|---|
| `open_pack(p_user_id, p_pack_id, p_roll, p_server_seed_hash, p_client_seed, p_nonce, p_roll_hash)` | The atomic rip — debit wallet, pick via weighted roll, allocate unit, write ledger, write `openings` row. |
| `credit_wallet(...)` | Used by the Stripe deposit webhook. Idempotent on `(reference_type, reference_id)`. |
| `request_payout(...)` | Deducts wallet + creates pending payout row. |
| `sellback_card(...)` | Moves a unit to `sold_back`, credits wallet, writes ledger. |
| `adjust_wallet(...)` | Admin-only credit/debit with audit trail. |
| `admin_cancel_payout(...)` | Cancels a pending payout and refunds the wallet. |
| `funnel_counts()` | Signups / first deposit / first rip / payouts — powers the admin funnel. |

---

## Provably-fair RNG

Implemented in `src/lib/rng.ts` (server) and verified in-browser at `/fairness`.

1. On first rip, the server generates a 32-byte `server_seed`, computes `server_seed_hash = sha256(server_seed)`, and stores the pair. Only the **hash** is sent to the client, committing the server to a seed it cannot change after the fact.
2. For each rip:
   - The client submits a `client_seed` (free-form string) and a monotonically increasing `nonce`.
   - The server computes `roll_hash = HMAC_SHA256(server_seed, client_seed + ":" + nonce)`.
   - The first 8 bytes of `roll_hash` are interpreted as a big-endian uint64 and divided by `2^64` to produce a uniform `[0, 1)` float.
   - `pickWeighted(roll, rewards)` walks the loot table by cumulative weight to select the reward.
3. All inputs and outputs (seed hash, client seed, nonce, roll hash, index into the loot table) are stored on the `openings` row.
4. When the user clicks **Rotate seed** in `/fairness`, the plaintext `server_seed` is revealed, and a fresh one is committed. They can now paste `(server_seed, server_seed_hash, client_seed, nonce, roll_hash)` into the verifier, which recomputes everything using WebCrypto — **no trust in our server required** to prove we couldn't have retroactively changed the outcome.

This is the same construction used by Roobet, Stake, and CSGORoll-class platforms.

---

## Stripe integration

**Deposits (`POST /api/wallet/deposit`)**

- Creates a Stripe Checkout Session with `mode: 'payment'` and `client_reference_id = user_id`.
- On `checkout.session.completed`, the webhook calls `credit_wallet(...)` with the session id as `reference_id`. Idempotent — Stripe retries are safe.

**Payouts (`POST /api/wallet/payout`)**

- On first payout, the user is routed through `/api/connect/onboarding` which creates a **Stripe Connect Express** account and returns a hosted KYC onboarding link. Stripe handles identity verification end-to-end.
- Once `account.updated` reports `payouts_enabled: true`, `request_payout(...)` deducts the wallet and inserts a pending `payouts` row. A `transfer + payout` pair is initiated on the Connect account.
- Webhook handles `payout.paid` (mark paid) and `payout.failed` (refund the wallet).

**Webhook (`POST /api/webhook/stripe`)**

- Verifies signatures with `STRIPE_WEBHOOK_SECRET`.
- Routes: `checkout.session.completed` → credit wallet; `account.updated` → sync Connect readiness onto profile; `payout.paid` / `payout.failed` → finalize payout row.

---

## Admin dashboard

Everything under `/admin` is gated by the middleware redirect **and** an in-layout `requireAdmin()` check. Non-admins see a 403 card.

See [Feature tour](#feature-tour) for the per-page breakdown. Key flows:

- **Wallet adjustment** — `POST /api/admin/wallet-adjust` calls `adjust_wallet(...)`. Writes a `transactions` ledger row (kind `adjustment`) and an `audit_log` row tagged with the admin actor. Capped at $10,000 per action as a blast-radius limit.
- **Cancel + refund payout** — `POST /api/admin/payout-review` calls `admin_cancel_payout(...)` which marks the payout canceled and credits the wallet back in one transaction.
- **Block / unblock user** — `POST /api/admin/user-flag` flips `profiles.blocked` and audit-logs the actor.

The dashboard's charts are 100% server-rendered SVG (`src/components/sparkline.tsx`) — no chart library, no client-side hydration cost, tiny bundle.

---

## Economics & tuning

- Each pack's `expected_value_cents` is auto-computed from its loot table on seed. A healthy house edge is **15–25%** (so `expected_value ≈ 0.75–0.85 × price`).
- `/admin/economics` shows **designed vs actual RTP** per pack. Actuals will bounce around at low sample counts (<1,000 rips). Investigate if they stay >30% off with n≥1,000.
- Sellback rate is `0.7` (70% of market value) — configured in `src/app/api/inventory/sellback/route.ts`. Raising it increases cash-out frequency but shrinks your margin.
- Shipping fees are a function of declared insured value — tweak in `src/app/api/shipping/request/route.ts`.

To change a loot table, edit `scripts/seed.ts` and re-run `npm run db:seed` (safe — upserts), or hand-edit `pack_rewards` in the Supabase SQL editor.

---

## Project layout

```
src/
  app/
    api/
      auth/bootstrap/          POST  ensure profile + wallet after login
      cards/meta/              GET   card metadata for the reveal reel
      connect/onboarding/      POST  Stripe Connect Express onboarding link
      fairness/rotate/         POST  reveal current server seed + issue a new one
      inventory/sellback/      POST  sell cards back to house
      packs/open/              POST  THE big one: atomic rip
      profile/                 POST  update display name / handle / public opt-in
      shipping/request/        POST  request physical shipment
      wallet/deposit/          POST  start Stripe Checkout
      wallet/payout/           POST  initiate ACH payout via Stripe Connect
      webhook/stripe/          POST  Stripe webhook (deposits + payouts + Connect)
      admin/
        wallet-adjust/         POST  credit/debit user wallet (admin only)
        user-flag/             POST  block / unblock user
        payout-review/         POST  cancel + refund pending payout
    auth/callback/             GET   OAuth + email confirmation landing
    admin/
      page.tsx                 Overview (KPIs, charts, queues, biggest pulls)
      analytics/               Funnel, retention, WAU, deposit histogram, ARPU/ARPPU
      economics/               Per-pack RTP vs designed, rarity actuals, top hits
      users/                   Searchable list + detail with wallet adjust
      inventory/               Stock levels
      payouts/                 Pending + history with cancel+refund
      openings/                Raw rip log
      packs/                   Loot table viewer
      shipments/               Fulfillment queue
    dashboard/                 Personal stats + profile settings
    fairness/                  Provably-fair explainer + per-roll verifier
    inventory/                 Held cards + ship/sellback actions
    packs/                     Catalog + detail pages
    u/[handle]/                Public "flex" profile (opt-in)
    wallet/                    Balance + deposit + ledger
    payouts/                   Connect onboarding + cash-out history
    age-gate/                  18+ gate
    unavailable/               Geo/state block landing
    terms/                     Terms of service
  components/                  UI primitives + client components (sparkline, reveal reel, etc.)
  lib/
    rng.ts                     HMAC-SHA256 provably-fair RNG
    supabase/                  Browser / SSR / service-role clients
    stripe.ts                  Lazy Stripe singleton
    auth.ts                    getSessionUser / requireUser / requireAdmin
    env.ts                     Zod-validated env
    admin-data.ts              Analytics/view helpers for /admin

db/
  schema.sql                   Tables, enums, RLS, seed for pack tiers
  functions.sql                Atomic RPCs: open_pack, credit_wallet, request_payout, sellback_card
  migrations/
    001_profile_handle.sql     Handle + public_profile columns, public-read RLS
    002_admin_analytics.sql    adjust_wallet, admin_cancel_payout, analytics views

scripts/
  seed.ts                      Starter card catalog + loot tables
  db-push.ts                   Apply schema + functions directly via DATABASE_URL

src/middleware.ts              Age gate + country/state geo-block + /admin cookie check
```

---

## Common tasks

| Task | Command |
|---|---|
| Install deps | `npm install` |
| Dev server on `:3000` | `npm run dev` |
| Production build | `npm run build` |
| Serve prod build | `npm run start` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Seed cards + loot tables | `npm run db:seed` |
| Apply schema via URI | `npm run db:push` |

---

## Deployment

### Vercel (recommended)

1. Push to GitHub (this repo).
2. Import into Vercel, framework auto-detected as Next.js.
3. Add every variable from `.env.example` in **Project Settings → Environment Variables**.
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain.
5. In Stripe, replace the CLI listener with a real webhook endpoint pointing at `https://your-domain/api/webhook/stripe`, copy the new `whsec_...` into Vercel's env.
6. In Supabase **Auth → URL Configuration**, add `https://your-domain/auth/callback`.
7. Deploy.

### Self-hosted

Any Node 20 host works — build with `npm run build`, run with `npm run start`. Put it behind a reverse proxy with TLS. Make sure the Stripe webhook endpoint is publicly reachable.

---

## Roadmap / known gaps

- Card catalog is ~17 seed cards. Hook **pokemontcg.io** or **TCGplayer** for real data with live prices.
- Shipping uses manual mail. Wire **EasyPost** or **Shippo** for real label generation + tracking.
- Responsible-gaming: deposit limits, loss limits, session timers, self-exclusion, cooling-off periods.
- Editable pack-rewards admin UI (today you edit via SQL or `scripts/seed.ts`).
- 2FA / TOTP on admin accounts.
- Better loss-streak anomaly detection and a daily "risk" feed in `/admin`.
- SOC2-style access logging for every admin action (partially there via `audit_log`).

---

## License

MIT. See [`LICENSE`](./LICENSE) (add one before going public if you care about trademarks/claims).

> Not affiliated with Nintendo, The Pokémon Company, or Wizards of the Coast. "Pokémon" is a trademark of its respective owners; card images are used for illustration only.
