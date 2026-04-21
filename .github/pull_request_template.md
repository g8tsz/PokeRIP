<!--
Thanks for contributing! Please fill this out so review moves fast.
Read CONTRIBUTING.md if you haven't yet.
-->

## What

<!-- One-line summary of the change. Keep it release-note-worthy. -->

## Why

<!-- The problem you're solving, or the motivation. Link issues with Closes #123 / Fixes #123. -->

## How

<!-- Brief rundown of the approach. Anything tricky or non-obvious? -->

## Screenshots / recording

<!-- Required for UI changes. Drag-and-drop into the description. -->

## Testing

<!-- How did you verify this? Commands run, flows exercised, edge cases covered. -->

- [ ] `npm run typecheck` passes locally
- [ ] `npm run build` passes locally
- [ ] Manually tested the affected flow(s)

## Touches sensitive code?

<!-- Check any that apply. Sensitive paths get extra review — see CONTRIBUTING.md. -->

- [ ] `src/lib/rng.ts` — provably-fair RNG
- [ ] `src/app/api/packs/open/` — atomic rip
- [ ] `src/app/api/webhook/stripe/` — money webhook
- [ ] `src/app/api/wallet/` — deposits or payouts
- [ ] `src/app/api/admin/` — admin power actions
- [ ] `src/middleware.ts` — geo / age / admin gate
- [ ] `db/functions.sql` or `db/migrations/*` — RPCs or RLS

## Migrations

<!-- If you added a new migration under db/migrations/, list it here. -->

- [ ] No DB changes
- [ ] Added `db/migrations/NNN_*.sql` — reviewer must apply this to their Supabase before pulling

## Checklist

- [ ] Updated README if user-facing setup or behavior changed
- [ ] Scrubbed any secrets / real emails / test card numbers from diffs and screenshots
- [ ] Linked the issue this PR closes
