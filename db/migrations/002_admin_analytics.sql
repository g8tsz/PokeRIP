-- ============================================================
-- Migration 002 — admin analytics views + admin actions
-- ============================================================

-- ------------------------------------------------------------
-- adjust_wallet
--   Admin-only. Credits or debits a user wallet and records a transaction.
--   Positive amount credits, negative debits.
-- ------------------------------------------------------------
create or replace function public.adjust_wallet(
  p_user_id uuid,
  p_amount_cents bigint,
  p_memo text,
  p_actor_id uuid
) returns bigint
language plpgsql
security definer
as $$
declare
  v_balance bigint;
  v_after   bigint;
begin
  if p_amount_cents = 0 then
    raise exception 'amount_must_be_nonzero';
  end if;

  select balance_cents into v_balance from public.wallets where user_id = p_user_id for update;
  if v_balance is null then
    insert into public.wallets (user_id, balance_cents) values (p_user_id, 0);
    v_balance := 0;
  end if;

  v_after := v_balance + p_amount_cents;
  if v_after < 0 then
    raise exception 'would_overdraw';
  end if;

  update public.wallets set balance_cents = v_after, updated_at = now() where user_id = p_user_id;

  insert into public.transactions (
    user_id, kind, status, amount_cents, balance_after_cents, reference_type, reference_id, memo, metadata
  ) values (
    p_user_id, 'adjustment', 'succeeded', p_amount_cents, v_after,
    'admin_adjustment', gen_random_uuid()::text, coalesce(p_memo, 'Admin adjustment'),
    jsonb_build_object('actor_id', p_actor_id)
  );

  insert into public.audit_log (user_id, actor_id, action, target_type, target_id, metadata)
    values (p_user_id, p_actor_id, 'wallet_adjust', 'wallet', p_user_id::text,
            jsonb_build_object('amount_cents', p_amount_cents, 'memo', p_memo));

  return v_after;
end;
$$;

grant execute on function public.adjust_wallet(uuid, bigint, text, uuid) to service_role;


-- ------------------------------------------------------------
-- admin_payout_review — cancel a pending payout + refund wallet
-- ------------------------------------------------------------
create or replace function public.admin_cancel_payout(
  p_payout_id uuid,
  p_actor_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
as $$
declare
  v_user uuid;
  v_amount bigint;
  v_status payout_status;
begin
  select user_id, amount_cents, status into v_user, v_amount, v_status
    from public.payouts where id = p_payout_id for update;
  if v_user is null then raise exception 'payout_not_found'; end if;
  if v_status <> 'pending' then raise exception 'payout_not_pending'; end if;

  update public.payouts
     set status = 'canceled',
         failure_reason = coalesce(p_reason, 'Canceled by admin')
   where id = p_payout_id;

  -- Refund the user's wallet.
  perform public.credit_wallet(v_user, v_amount, 'adjustment', 'payout_cancel', p_payout_id::text,
                               coalesce(p_reason, 'Refund — payout canceled'));

  insert into public.audit_log (user_id, actor_id, action, target_type, target_id, metadata)
    values (v_user, p_actor_id, 'payout_cancel', 'payout', p_payout_id::text,
            jsonb_build_object('amount_cents', v_amount, 'reason', p_reason));
end;
$$;

grant execute on function public.admin_cancel_payout(uuid, uuid, text) to service_role;


-- ------------------------------------------------------------
-- Views for analytics (readable by service_role only; they bypass RLS anyway)
-- ------------------------------------------------------------

-- Daily revenue + activity for the last 90 days.
create or replace view public.v_daily_metrics as
with days as (
  select generate_series(
    (current_date - interval '89 days')::date,
    current_date,
    interval '1 day'
  )::date as day
),
signups as (
  select created_at::date as day, count(*)::int as n
    from public.profiles
    where created_at >= current_date - interval '89 days'
    group by 1
),
rips as (
  select created_at::date as day,
         count(*)::int as n,
         coalesce(sum(price_cents), 0)::bigint as gross_cents,
         coalesce(sum(payout_value_cents), 0)::bigint as payout_value_cents,
         count(distinct user_id)::int as dau
    from public.openings
    where created_at >= current_date - interval '89 days'
    group by 1
),
deposits as (
  select created_at::date as day,
         count(*)::int as n,
         coalesce(sum(amount_cents), 0)::bigint as cents
    from public.transactions
    where kind = 'deposit' and status = 'succeeded' and created_at >= current_date - interval '89 days'
    group by 1
),
withdrawals as (
  select created_at::date as day,
         count(*)::int as n,
         coalesce(sum(-amount_cents), 0)::bigint as cents
    from public.transactions
    where kind = 'withdrawal' and created_at >= current_date - interval '89 days'
    group by 1
)
select d.day,
       coalesce(s.n, 0)            as signups,
       coalesce(r.n, 0)            as rips,
       coalesce(r.dau, 0)          as dau,
       coalesce(r.gross_cents, 0)  as pack_revenue_cents,
       coalesce(r.payout_value_cents, 0) as card_value_awarded_cents,
       coalesce(d2.n, 0)           as deposit_count,
       coalesce(d2.cents, 0)       as deposit_cents,
       coalesce(w.n, 0)            as withdrawal_count,
       coalesce(w.cents, 0)        as withdrawal_cents
  from days d
  left join signups s      on s.day = d.day
  left join rips r         on r.day = d.day
  left join deposits d2    on d2.day = d.day
  left join withdrawals w  on w.day = d.day
  order by d.day asc;

grant select on public.v_daily_metrics to service_role;


-- Per-pack lifetime performance.
create or replace view public.v_pack_performance as
select p.id, p.slug, p.name, p.price_cents, p.expected_value_cents, p.active,
       coalesce(stats.rips, 0)         as rips,
       coalesce(stats.gross_cents, 0)  as gross_cents,
       coalesce(stats.value_awarded_cents, 0) as value_awarded_cents,
       case when coalesce(stats.gross_cents, 0) > 0
            then round(100.0 * stats.value_awarded_cents / stats.gross_cents, 2)
            else 0
       end as actual_rtp_pct,
       coalesce(stats.unique_users, 0) as unique_users
  from public.packs p
  left join (
    select pack_id,
           count(*)::int as rips,
           sum(price_cents)::bigint as gross_cents,
           sum(payout_value_cents)::bigint as value_awarded_cents,
           count(distinct user_id)::int as unique_users
      from public.openings
      group by 1
  ) stats on stats.pack_id = p.id;

grant select on public.v_pack_performance to service_role;


-- User leaderboard / ops view (spend + pulled value per user).
create or replace view public.v_user_metrics as
select pr.id,
       pr.email,
       pr.handle,
       pr.display_name,
       pr.created_at,
       pr.blocked,
       pr.kyc_verified,
       coalesce(w.balance_cents, 0)                       as balance_cents,
       coalesce(w.lifetime_deposit_cents, 0)              as lifetime_deposit_cents,
       coalesce(w.lifetime_withdraw_cents, 0)             as lifetime_withdraw_cents,
       coalesce(stats.rips, 0)                            as rips,
       coalesce(stats.gross_cents, 0)                     as total_spent_cents,
       coalesce(stats.value_awarded_cents, 0)             as total_pulled_value_cents,
       stats.last_rip_at
  from public.profiles pr
  left join public.wallets w on w.user_id = pr.id
  left join (
    select user_id,
           count(*)::int as rips,
           sum(price_cents)::bigint as gross_cents,
           sum(payout_value_cents)::bigint as value_awarded_cents,
           max(created_at) as last_rip_at
      from public.openings
      group by 1
  ) stats on stats.user_id = pr.id;

grant select on public.v_user_metrics to service_role;


-- Per-card inventory summary.
create or replace view public.v_card_inventory as
select c.id,
       c.name,
       c.set_name,
       c.rarity,
       c.market_value_cents,
       coalesce(units.total, 0)          as total_units,
       coalesce(units.held_free, 0)      as held_free,
       coalesce(units.allocated, 0)      as allocated,
       coalesce(units.shipped, 0)        as shipped,
       coalesce(units.sold_back, 0)      as sold_back
  from public.cards c
  left join (
    select card_id,
           count(*)::int as total,
           count(*) filter (where state = 'held' and owned_by_user is null)::int     as held_free,
           count(*) filter (where state = 'held' and owned_by_user is not null)::int as allocated,
           count(*) filter (where state in ('ship_requested','shipped'))::int        as shipped,
           count(*) filter (where state = 'sold_back')::int                          as sold_back
      from public.card_units
      group by 1
  ) units on units.card_id = c.id;

grant select on public.v_card_inventory to service_role;


-- ------------------------------------------------------------
-- Signup-to-first-deposit / first-rip retention helper
-- ------------------------------------------------------------
create or replace function public.funnel_counts()
returns table (signups int, first_deposit int, first_rip int, payouts int)
language sql
security definer
as $$
  select
    (select count(*)::int from public.profiles),
    (select count(distinct user_id)::int from public.transactions where kind='deposit' and status='succeeded'),
    (select count(distinct user_id)::int from public.openings),
    (select count(distinct user_id)::int from public.payouts);
$$;

grant execute on function public.funnel_counts() to service_role;
