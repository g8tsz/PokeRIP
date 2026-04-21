-- ============================================================
-- Migration 001 — public flex surface
-- Adds a unique URL-safe handle + a toggle for public stats.
-- Run after schema.sql / functions.sql.
-- ============================================================

alter table public.profiles
  add column if not exists handle citext unique,
  add column if not exists public_profile boolean not null default false,
  add column if not exists avatar_url text;

-- Let the public read the non-sensitive flex fields when a user opts in.
drop policy if exists "public read flex profiles" on public.profiles;
create policy "public read flex profiles"
  on public.profiles
  for select
  using (public_profile = true);

-- When public_profile = true, also expose that user's openings for the public profile page.
drop policy if exists "public read flex openings" on public.openings;
create policy "public read flex openings"
  on public.openings
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = openings.user_id and p.public_profile = true
    )
  );
