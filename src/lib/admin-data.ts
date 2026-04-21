import { createSupabaseAdmin } from "@/lib/supabase/server";

export type DailyMetric = {
  day: string; // ISO date
  signups: number;
  rips: number;
  dau: number;
  pack_revenue_cents: number;
  card_value_awarded_cents: number;
  deposit_count: number;
  deposit_cents: number;
  withdrawal_count: number;
  withdrawal_cents: number;
};

export async function getDailyMetrics(days = 30): Promise<DailyMetric[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("v_daily_metrics")
    .select("*")
    .order("day", { ascending: true });

  if (error || !data) return [];
  const rows = (data as unknown as DailyMetric[]) ?? [];
  return rows.slice(-days);
}

export function sumRange<K extends keyof DailyMetric>(rows: DailyMetric[], key: K): number {
  return rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);
}

export function periodCompare(rows: DailyMetric[]) {
  // Last 7d vs previous 7d.
  const last7 = rows.slice(-7);
  const prev7 = rows.slice(-14, -7);

  function delta<K extends keyof DailyMetric>(key: K) {
    const a = sumRange(last7, key);
    const b = sumRange(prev7, key);
    if (b === 0) return { value: a, pct: a > 0 ? 100 : 0 };
    return { value: a, pct: ((a - b) / b) * 100 };
  }

  return {
    signups: delta("signups"),
    rips: delta("rips"),
    dau: delta("dau"),
    pack_revenue_cents: delta("pack_revenue_cents"),
    deposit_cents: delta("deposit_cents"),
    withdrawal_cents: delta("withdrawal_cents"),
  };
}

export type PackPerformance = {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  expected_value_cents: number;
  active: boolean;
  rips: number;
  gross_cents: number;
  value_awarded_cents: number;
  actual_rtp_pct: number;
  unique_users: number;
};

export async function getPackPerformance(): Promise<PackPerformance[]> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("v_pack_performance")
    .select("*")
    .order("gross_cents", { ascending: false });
  return (data as unknown as PackPerformance[]) ?? [];
}

export type UserMetric = {
  id: string;
  email: string;
  handle: string | null;
  display_name: string | null;
  created_at: string;
  blocked: boolean;
  kyc_verified: boolean;
  balance_cents: number;
  lifetime_deposit_cents: number;
  lifetime_withdraw_cents: number;
  rips: number;
  total_spent_cents: number;
  total_pulled_value_cents: number;
  last_rip_at: string | null;
};

export async function getUserMetrics(opts: {
  search?: string;
  orderBy?: "created_at" | "total_spent_cents" | "balance_cents" | "last_rip_at";
  desc?: boolean;
  limit?: number;
}): Promise<UserMetric[]> {
  const admin = createSupabaseAdmin();
  let q = admin.from("v_user_metrics").select("*");
  if (opts.search) {
    q = q.or(`email.ilike.%${opts.search}%,handle.ilike.%${opts.search}%,display_name.ilike.%${opts.search}%`);
  }
  q = q.order(opts.orderBy ?? "created_at", { ascending: !opts.desc, nullsFirst: false });
  q = q.limit(opts.limit ?? 100);
  const { data } = await q;
  return (data as unknown as UserMetric[]) ?? [];
}

export async function getFunnelCounts(): Promise<{
  signups: number;
  first_deposit: number;
  first_rip: number;
  payouts: number;
}> {
  const admin = createSupabaseAdmin();
  const { data } = await admin.rpc("funnel_counts");
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? { signups: 0, first_deposit: 0, first_rip: 0, payouts: 0 };
}

export type CardInventory = {
  id: string;
  name: string;
  set_name: string | null;
  rarity: string;
  market_value_cents: number;
  total_units: number;
  held_free: number;
  allocated: number;
  shipped: number;
  sold_back: number;
};

export async function getCardInventory(): Promise<CardInventory[]> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("v_card_inventory")
    .select("*")
    .order("market_value_cents", { ascending: false });
  return (data as unknown as CardInventory[]) ?? [];
}
