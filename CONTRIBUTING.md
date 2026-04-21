# Contributing to PokéRip

Thanks for your interest. This project is a functional foundation for a real-money Pokémon card case-opening platform. **Read the [Legal reality check](./README.md#-legal-reality-check--read-first) in the README before doing anything that touches money, odds, or compliance code.**

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Ways to help](#ways-to-help)
- [Dev environment](#dev-environment)
- [Workflow](#workflow)
- [Coding standards](#coding-standards)
- [Database migrations](#database-migrations)
- [Security-sensitive code](#security-sensitive-code)
- [Testing your changes locally](#testing-your-changes-locally)
- [Commit style](#commit-style)
- [Pull requests](#pull-requests)
- [Reporting bugs](#reporting-bugs)
- [Reporting security issues](#reporting-security-issues)

---

## Code of conduct

Be kind. Assume good intent. No harassment, no hate speech, no promoting real-world harm. Maintainers may close issues and PRs that violate this without warning.

---

## Ways to help

In rough priority order:

1. **Responsible-gaming features.** Deposit limits, loss limits, session timers, self-exclusion, cool-down periods, problem-gambling referrals. This is the single highest-leverage area.
2. **Real card catalog.** Hook `pokemontcg.io` or TCGplayer so prices aren't a hand-typed seed.
3. **Real shipping.** Wire EasyPost or Shippo for label generation + tracking on `/admin/shipments`.
4. **Tests.** There are currently zero. Vitest + a few smoke tests around `src/lib/rng.ts`, `/api/packs/open`, and `/api/wallet/deposit` would be huge.
5. **Editable admin loot tables.** Today you edit `scripts/seed.ts` or hand-run SQL. An editor UI under `/admin/packs/[slug]` with weight validation and live EV preview would be great.
6. **Better anomaly detection** — suspicious loss streaks, rapid deposit/withdraw cycling, abnormally good win rates. Surface in `/admin`.
7. **Accessibility pass.** Keyboard paths through the reveal animation, ARIA on the admin tables, focus rings on custom buttons.
8. **Docs, examples, bug reports.**

If you're picking up something non-trivial, **open an issue first** so we can align on approach before you burn a weekend on a PR that needs a rewrite.

---

## Dev environment

Prereqs: Node 20+, a free Supabase project, a Stripe test account, the Stripe CLI.

```bash
git clone https://github.com/g8tsz/PokeRIP.git
cd PokeRIP
npm install
cp .env.example .env.local   # then fill it in — see README "Environment variables"
npm run db:seed              # once Supabase is set up and schema is applied
npm run dev
```

Second terminal for Stripe:

```bash
stripe listen --forward-to localhost:3000/api/webhook/stripe
```

Full setup with Supabase migrations and Stripe Connect config is in the [README](./README.md#setup-local-dev).

---

## Workflow

1. Fork the repo and create a branch off `main`:
   ```bash
   git checkout -b feat/loss-limits
   ```
   Branch prefix conventions: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `security/`.
2. Make your changes. Keep commits focused.
3. **Every PR must pass `npm run typecheck` and `npm run build` locally.** CI enforces this (see `.github/workflows/ci.yml`).
4. Open a PR with the template filled out. Link the issue you're closing.
5. Respond to review comments by pushing new commits to the branch (don't force-push until approval).

---

## Coding standards

- **TypeScript strict mode.** No `any` unless you annotate why with a `// why:` comment.
- **Next.js App Router conventions.** Server Components by default. Add `"use client"` only when you need it (state, effects, event handlers, browser APIs).
- **Three Supabase clients; use the least powerful one that works.**
  - `createSupabaseBrowser` — public client-side reads.
  - `createSupabaseServer` — server components / route handlers with the user's session cookies.
  - `createSupabaseAdmin` — service role. Server-only. Bypasses RLS. Treat it like a loaded gun.
- **No service-role key in the browser.** Ever. Audit your diff for imports of `createSupabaseAdmin` inside `"use client"` files.
- **Validate every API body with Zod.** See `src/app/api/admin/wallet-adjust/route.ts` for the pattern.
- **Money is `bigint` cents end-to-end.** Never round in TypeScript. Use `formatUSD` only at the edge of the UI.
- **Tailwind + the existing theme.** Reuse `glass`, `glass-strong`, `chip`, `btn-primary`, `btn-ghost`, `btn-danger`, `card-tile`, `text-rarity-*`. Don't invent ad-hoc colors.
- **No unexplained comments.** See the "making code changes" norms in `AGENTS.md`-style rules: only comment when the code can't explain itself.
- **Prefer small, composable React components.** Page files should be boring orchestrators; push interactive chunks into `src/components/`.
- **Imports go through `@/` aliases** (configured in `tsconfig.json`).

---

## Database migrations

Schema changes land as **numbered SQL files** under `db/migrations/`. Never edit an already-shipped migration — add a new one.

```bash
db/migrations/001_profile_handle.sql
db/migrations/002_admin_analytics.sql
db/migrations/003_your_change.sql   # <- new
```

Checklist for a new migration:

- [ ] File name is `NNN_short_description.sql` with `NNN` strictly greater than the highest existing number.
- [ ] Idempotent: uses `create ... if not exists`, `create or replace`, `alter table ... add column if not exists`.
- [ ] If you add a table or column, enable or update **Row Level Security** policies.
- [ ] New RPC functions are `security definer`, `grant execute ... to service_role` at the bottom.
- [ ] Update the README's [Database schema](./README.md#database-schema) table.
- [ ] If the change affects the admin dashboard, test against fresh + existing data.

---

## Security-sensitive code

Changes in these files require **extra scrutiny** — flag them in your PR description:

| Path | Why |
|---|---|
| `src/lib/rng.ts` | The provably-fair guarantee lives or dies here. Any change must preserve determinism of `computeRoll` and keep `verifyRoll` honest. |
| `src/app/api/packs/open/route.ts` | Atomic rip flow. Races here drain the house. |
| `src/app/api/webhook/stripe/route.ts` | Idempotency + signature verification. Breaking either can double-credit or silently drop money. |
| `src/app/api/wallet/payout/route.ts` | Real-money egress. Any logic bug can accidentally pay out users multiple times. |
| `src/app/api/admin/*` | Admin-power actions — must check `requireAdmin()` at the very top and write to `audit_log`. |
| `src/middleware.ts` | Geo-block, age gate, `/admin` cookie check. |
| `db/functions.sql`, `db/migrations/*` | `security definer` functions bypass RLS. One missed permission check can expose everything. |

If you're not sure whether a change is sensitive, assume it is and ask in the PR.

---

## Testing your changes locally

Minimum bar before pushing:

```bash
npm run typecheck    # zero errors
npm run lint         # zero errors (warnings OK but prefer zero)
npm run build        # must succeed
```

If your change touches money or inventory, also manually exercise:

1. Fresh signup → deposit (Stripe test card `4242 4242 4242 4242`) → rip → sell back → rip → ship-request → payout.
2. Open `/admin`, confirm your rip shows up with the correct price/value/delta.
3. Open `/fairness/[openingId]` and verify the roll in the browser.
4. Trigger the Stripe webhook for both `checkout.session.completed` and `payout.paid` (or replay in the dashboard) — confirm no double-credits.

If you touched RLS, test with a **non-admin** user too. It's easy to accidentally only fix the admin case.

---

## Commit style

Short imperative subject, 72-char limit, optional body explaining the **why**.

Good:
```
fix(packs/open): close race between wallet lock and reward pick

The previous implementation released the wallet lock before inserting
the openings row, which allowed a second concurrent rip to debit again
before the first one finished. Moved both into open_pack() so they
share the same transaction.
```

Bad:
```
updated stuff
```

Optional scope prefixes: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `security`, `perf`. No Conventional Commits tooling is enforced — just be readable.

---

## Pull requests

A good PR:

- Has a **title** that would make sense as a release-note line.
- Has a **description** that answers: what changed, why, how to test it.
- Has **screenshots or recordings** for UI changes.
- **Links the issue** it closes (`Closes #42`).
- Ships with migrations / seed updates if it needs them.
- **Passes CI** (typecheck + build). Reviewers won't start on red PRs.
- Updates the README if user-facing behavior or setup changes.

Small PRs merge faster than big ones. If you find yourself with a 2,000-line diff, consider splitting.

---

## Reporting bugs

Open a GitHub issue with:

- What you expected to happen.
- What actually happened (error message, screenshot, reproduction URL).
- Steps to reproduce — ideally starting from a fresh `npm run db:seed`.
- Your environment (Node version, OS, browser).
- Any relevant log output. Scrub secrets from Stripe / Supabase dashboard URLs.

Use the "Bug report" issue template when it shows up.

---

## Reporting security issues

**Do not open a public issue for security vulnerabilities.**

Email or DM the maintainer privately with:

- A description of the vulnerability.
- Reproduction steps or a proof-of-concept.
- Your assessment of impact (can it drain wallets, bypass geo-block, forge rolls, leak PII, etc.).

We'll acknowledge within 72 hours, fix in a private branch, and credit you in the release notes if you want. Responsible disclosure gets a visible thank-you; dropping a zero-day in the issue tracker does not.

Areas that deserve immediate escalation: RNG manipulation, wallet double-credits, RLS bypasses, admin auth bypasses, PII leaks, Stripe webhook forgery.

---

Thanks for helping keep PokéRip honest.
