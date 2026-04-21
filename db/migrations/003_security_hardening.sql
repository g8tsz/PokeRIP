-- ============================================================
-- Migration 003 — security hardening
--   * request_shipment:  atomic wallet debit + shipment creation
--   * reverse_deposit:   idempotent wallet debit for refunds /
--                        chargebacks (webhook-driven)
-- ============================================================

-- ------------------------------------------------------------
-- request_shipment
--   Atomically:
--     1. Locks and validates every card_unit (must be owned + held).
--     2. Locks and debits the user's wallet for the shipping fee
--        (only if > 0; insufficient funds aborts the whole tx).
--     3. Creates the shipment + shipment_items rows.
--     4. Flips the card_units to 'ship_requested'.
--     5. Writes the ledger row.
--
--   All-or-nothing: if any step fails, the transaction rolls back and
--   the user's wallet / inventory are untouched.
-- ------------------------------------------------------------
create or replace function public.request_shipment(
  p_user_id uuid,
  p_unit_ids uuid[],
  p_address_id uuid,
  p_shipping_fee_cents bigint
) returns table (
  shipment_id uuid,
  balance_after_cents bigint,
  insured_value_cents bigint,
  item_count int
)
language plpgsql
security definer
as $$
declare
  v_balance      bigint;
  v_total_value  bigint := 0;
  v_shipment_id  uuid := gen_random_uuid();
  v_bal_after    bigint;
  v_valid_units  uuid[];
  v_count        int;
begin
  if p_shipping_fee_cents < 0 then
    raise exception 'invalid_shipping_fee';
  end if;

  -- 1. Address must belong to the user.
  if not exists (
    select 1 from public.addresses where id = p_address_id and user_id = p_user_id
  ) then
    raise exception 'invalid_address';
  end if;

  -- 2. Lock + validate card_units in a single pass so the set of
  --    eligible cards can't change between the check and the update.
  select
    coalesce(array_agg(cu.id), '{}'::uuid[]),
    coalesce(sum(c.market_value_cents), 0)
    into v_valid_units, v_total_value
  from public.card_units cu
  join public.cards c on c.id = cu.card_id
  where cu.id = any(p_unit_ids)
    and cu.owned_by_user = p_user_id
    and cu.state = 'held'
  for update of cu;

  v_count := coalesce(array_length(v_valid_units, 1), 0);
  if v_count = 0 then
    raise exception 'no_valid_cards';
  end if;

  -- 3. Lock + debit wallet for the fee (if any).
  select balance_cents into v_balance
    from public.wallets where user_id = p_user_id
    for update;

  if v_balance is null then
    raise exception 'wallet_not_found';
  end if;

  if p_shipping_fee_cents > 0 and v_balance < p_shipping_fee_cents then
    raise exception 'insufficient_funds_for_shipping';
  end if;

  v_bal_after := v_balance - p_shipping_fee_cents;

  if p_shipping_fee_cents > 0 then
    update public.wallets
       set balance_cents = v_bal_after,
           updated_at = now()
     where user_id = p_user_id;
  end if;

  -- 4. Create shipment row.
  insert into public.shipments (
    id, user_id, address_id, status, shipping_fee_cents, insured_value_cents
  ) values (
    v_shipment_id, p_user_id, p_address_id, 'requested', p_shipping_fee_cents, v_total_value
  );

  -- 5. Shipment items.
  insert into public.shipment_items (shipment_id, card_unit_id)
  select v_shipment_id, unnest(v_valid_units);

  -- 6. Move units into ship_requested.
  update public.card_units
     set state = 'ship_requested', updated_at = now()
   where id = any(v_valid_units);

  -- 7. Ledger row (only if we actually charged a fee).
  if p_shipping_fee_cents > 0 then
    insert into public.transactions (
      user_id, kind, status, amount_cents, balance_after_cents,
      reference_type, reference_id, memo
    ) values (
      p_user_id, 'shipping_fee', 'succeeded', -p_shipping_fee_cents, v_bal_after,
      'shipment', v_shipment_id::text, 'Shipping fee'
    );
  end if;

  shipment_id := v_shipment_id;
  balance_after_cents := v_bal_after;
  insured_value_cents := v_total_value;
  item_count := v_count;
  return next;
end;
$$;

grant execute on function public.request_shipment(uuid, uuid[], uuid, bigint) to service_role;


-- ------------------------------------------------------------
-- reverse_deposit
--   Webhook-driven wallet debit for Stripe refunds / chargebacks.
--   Idempotent on (reference_type, reference_id).
--
--   The wallet balance IS allowed to go negative — that represents
--   money already spent by the user that has been clawed back by
--   the card network. Admins will reconcile from /admin/payouts.
-- ------------------------------------------------------------
create or replace function public.reverse_deposit(
  p_user_id uuid,
  p_amount_cents bigint,
  p_reference_type text,
  p_reference_id text,
  p_memo text
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
     set balance_cents = balance_cents - p_amount_cents,
         updated_at = now()
   where user_id = p_user_id
   returning balance_cents into v_balance_after;

  if v_balance_after is null then
    raise exception 'wallet_not_found';
  end if;

  insert into public.transactions (
    user_id, kind, status, amount_cents, balance_after_cents,
    reference_type, reference_id, memo
  ) values (
    p_user_id, 'adjustment', 'succeeded', -p_amount_cents, v_balance_after,
    p_reference_type, p_reference_id, p_memo
  );

  return v_balance_after;
end;
$$;

grant execute on function public.reverse_deposit(uuid, bigint, text, text, text) to service_role;
