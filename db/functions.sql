-- ============================================================
-- PokéRip — atomic RPC functions
-- Run after schema.sql:  psql "$DATABASE_URL" -f db/functions.sql
-- ============================================================

-- ------------------------------------------------------------
-- open_pack
--   Atomically:
--     1. Locks and debits the user's wallet for p_price_cents.
--     2. Claims an optional inventory unit for the chosen card.
--     3. Inserts an `openings` row and a `transactions` ledger row.
--     4. Returns the opening id and wallet-after balance.
--
--   The caller (server route) is responsible for picking p_reward_id
--   using the provably-fair RNG. This function validates that the
--   reward belongs to the pack and that the price matches.
-- ------------------------------------------------------------
create or replace function public.open_pack(
  p_user_id uuid,
  p_pack_id uuid,
  p_price_cents bigint,
  p_reward_id uuid,
  p_server_seed_id uuid,
  p_server_seed_hash text,
  p_client_seed text,
  p_nonce int,
  p_roll_hash text,
  p_roll_value numeric
) returns table (
  opening_id uuid,
  card_id uuid,
  card_unit_id uuid,
  payout_value_cents bigint,
  balance_after_cents bigint
)
language plpgsql
security definer
as $$
declare
  v_wallet_balance bigint;
  v_pack_price     bigint;
  v_card_id        uuid;
  v_card_value     bigint;
  v_unit_id        uuid;
  v_opening_id     uuid := gen_random_uuid();
  v_balance_after  bigint;
  v_max_supply     int;
  v_awarded        int;
begin
  -- Validate pack + price match (prevents price tampering).
  select price_cents into v_pack_price from public.packs where id = p_pack_id and active = true;
  if v_pack_price is null then
    raise exception 'pack_not_found_or_inactive';
  end if;
  if v_pack_price <> p_price_cents then
    raise exception 'price_mismatch';
  end if;

  -- Validate reward belongs to pack + check supply cap.
  select card_id, max_supply, awarded_count
    into v_card_id, v_max_supply, v_awarded
  from public.pack_rewards
  where id = p_reward_id and pack_id = p_pack_id
  for update;

  if v_card_id is null then
    raise exception 'reward_not_in_pack';
  end if;
  if v_max_supply is not null and v_awarded >= v_max_supply then
    raise exception 'reward_sold_out';
  end if;

  -- Card market value snapshot.
  select market_value_cents into v_card_value from public.cards where id = v_card_id;
  v_card_value := coalesce(v_card_value, 0);

  -- Lock and debit wallet.
  select balance_cents into v_wallet_balance
    from public.wallets
    where user_id = p_user_id
    for update;

  if v_wallet_balance is null then
    raise exception 'wallet_not_found';
  end if;
  if v_wallet_balance < p_price_cents then
    raise exception 'insufficient_funds';
  end if;

  v_balance_after := v_wallet_balance - p_price_cents;

  update public.wallets
     set balance_cents = v_balance_after,
         updated_at = now()
   where user_id = p_user_id;

  -- Try to claim a physical card unit (optional — might be null if none).
  select id into v_unit_id
    from public.card_units
    where card_id = v_card_id and state = 'held' and owned_by_user is null
    order by created_at asc
    limit 1
    for update skip locked;

  if v_unit_id is not null then
    update public.card_units
       set owned_by_user = p_user_id,
           updated_at = now()
     where id = v_unit_id;
  end if;

  -- Bump reward awarded_count.
  update public.pack_rewards
     set awarded_count = awarded_count + 1
   where id = p_reward_id;

  -- Bump nonce on the seed (server-controlled; we pass in what we used).
  update public.server_seeds
     set nonce = greatest(nonce, p_nonce + 1)
   where id = p_server_seed_id;

  -- Insert opening row.
  insert into public.openings (
    id, user_id, pack_id, price_cents,
    server_seed_id, server_seed_hash, client_seed, nonce, roll_hash, roll_value,
    reward_id, card_id, card_unit_id, payout_value_cents
  ) values (
    v_opening_id, p_user_id, p_pack_id, p_price_cents,
    p_server_seed_id, p_server_seed_hash, p_client_seed, p_nonce, p_roll_hash, p_roll_value,
    p_reward_id, v_card_id, v_unit_id, v_card_value
  );

  -- Ledger entry (debit).
  insert into public.transactions (
    user_id, kind, status, amount_cents, balance_after_cents, reference_type, reference_id, memo
  ) values (
    p_user_id, 'pack_purchase', 'succeeded', -p_price_cents, v_balance_after,
    'pack_opening', v_opening_id::text, 'Pack rip'
  );

  opening_id := v_opening_id;
  card_id := v_card_id;
  card_unit_id := v_unit_id;
  payout_value_cents := v_card_value;
  balance_after_cents := v_balance_after;
  return next;
end;
$$;

grant execute on function public.open_pack(
  uuid, uuid, bigint, uuid, uuid, text, text, int, text, numeric
) to service_role;


-- ------------------------------------------------------------
-- credit_wallet  — used by Stripe deposit webhook
-- ------------------------------------------------------------
create or replace function public.credit_wallet(
  p_user_id uuid,
  p_amount_cents bigint,
  p_kind txn_kind,
  p_reference_type text,
  p_reference_id text,
  p_memo text default null
) returns bigint
language plpgsql
security definer
as $$
declare
  v_balance_after bigint;
begin
  if p_amount_cents <= 0 then
    raise exception 'amount_must_be_positive';
  end if;

  -- Idempotency: if we've seen this reference before, return current balance.
  if exists (
    select 1 from public.transactions
     where reference_type = p_reference_type
       and reference_id = p_reference_id
       and status = 'succeeded'
  ) then
    select balance_cents into v_balance_after from public.wallets where user_id = p_user_id;
    return v_balance_after;
  end if;

  update public.wallets
     set balance_cents = balance_cents + p_amount_cents,
         lifetime_deposit_cents = case when p_kind = 'deposit'
                                       then lifetime_deposit_cents + p_amount_cents
                                       else lifetime_deposit_cents end,
         updated_at = now()
   where user_id = p_user_id
   returning balance_cents into v_balance_after;

  if v_balance_after is null then
    -- create wallet if missing
    insert into public.wallets (user_id, balance_cents)
      values (p_user_id, p_amount_cents)
      on conflict (user_id) do update set balance_cents = public.wallets.balance_cents + p_amount_cents
      returning balance_cents into v_balance_after;
  end if;

  insert into public.transactions (
    user_id, kind, status, amount_cents, balance_after_cents, reference_type, reference_id, memo
  ) values (
    p_user_id, p_kind, 'succeeded', p_amount_cents, v_balance_after, p_reference_type, p_reference_id, p_memo
  );

  return v_balance_after;
end;
$$;

grant execute on function public.credit_wallet(uuid, bigint, txn_kind, text, text, text) to service_role;


-- ------------------------------------------------------------
-- request_payout  — debits wallet and creates a payouts row (pending)
-- The actual Stripe transfer is initiated by the app after this returns.
-- ------------------------------------------------------------
create or replace function public.request_payout(
  p_user_id uuid,
  p_amount_cents bigint
) returns uuid
language plpgsql
security definer
as $$
declare
  v_balance bigint;
  v_payout_id uuid := gen_random_uuid();
  v_after bigint;
begin
  if p_amount_cents < 100 then
    raise exception 'minimum_payout_100_cents';
  end if;

  select balance_cents into v_balance from public.wallets where user_id = p_user_id for update;
  if v_balance is null or v_balance < p_amount_cents then
    raise exception 'insufficient_funds';
  end if;

  v_after := v_balance - p_amount_cents;

  update public.wallets
     set balance_cents = v_after,
         lifetime_withdraw_cents = lifetime_withdraw_cents + p_amount_cents,
         updated_at = now()
   where user_id = p_user_id;

  insert into public.payouts (id, user_id, amount_cents, status)
    values (v_payout_id, p_user_id, p_amount_cents, 'pending');

  insert into public.transactions (
    user_id, kind, status, amount_cents, balance_after_cents, reference_type, reference_id, memo
  ) values (
    p_user_id, 'withdrawal', 'pending', -p_amount_cents, v_after, 'payout', v_payout_id::text, 'ACH payout requested'
  );

  return v_payout_id;
end;
$$;

grant execute on function public.request_payout(uuid, bigint) to service_role;


-- ------------------------------------------------------------
-- sellback_card  — user sells a pulled card unit back to the house for wallet credit
-- Payout percentage is set by the caller (e.g. 70% of market value).
-- ------------------------------------------------------------
create or replace function public.sellback_card(
  p_user_id uuid,
  p_unit_id uuid,
  p_payout_cents bigint
) returns bigint
language plpgsql
security definer
as $$
declare
  v_owner uuid;
  v_state inventory_state;
  v_balance_after bigint;
begin
  if p_payout_cents <= 0 then
    raise exception 'amount_must_be_positive';
  end if;

  select owned_by_user, state into v_owner, v_state
    from public.card_units where id = p_unit_id for update;

  if v_owner is null or v_owner <> p_user_id then
    raise exception 'not_your_card';
  end if;
  if v_state <> 'held' then
    raise exception 'card_not_available';
  end if;

  update public.card_units
     set state = 'sold_back',
         owned_by_user = null,
         updated_at = now()
   where id = p_unit_id;

  update public.wallets
     set balance_cents = balance_cents + p_payout_cents,
         updated_at = now()
   where user_id = p_user_id
   returning balance_cents into v_balance_after;

  insert into public.transactions (
    user_id, kind, status, amount_cents, balance_after_cents, reference_type, reference_id, memo
  ) values (
    p_user_id, 'sellback_credit', 'succeeded', p_payout_cents, v_balance_after,
    'card_unit', p_unit_id::text, 'Sellback'
  );

  return v_balance_after;
end;
$$;

grant execute on function public.sellback_card(uuid, uuid, bigint) to service_role;
