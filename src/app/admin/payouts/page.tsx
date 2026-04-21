import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";
import { PayoutReviewButtons } from "@/components/payout-review-buttons";

export const dynamic = "force-dynamic";

type PayoutRow = {
  id: string;
  user_id: string;
  amount_cents: number;
  fee_cents: number;
  status: string;
  requested_at: string;
  paid_at: string | null;
  failure_reason: string | null;
  profile: {
    email: string;
    handle: string | null;
    display_name: string | null;
  } | null;
};

export default async function AdminPayouts() {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("payouts")
    .select(
      "id, user_id, amount_cents, fee_cents, status, requested_at, paid_at, failure_reason, profile:profiles(email, handle, display_name)",
    )
    .order("requested_at", { ascending: false })
    .limit(200);

  const rows = ((data as unknown) as PayoutRow[] | null) ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const paid = rows.filter((r) => r.status === "paid");
  const failed = rows.filter((r) => r.status === "failed" || r.status === "canceled");

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">Payouts</h1>
        <div className="text-sm text-white/50">Review ACH cashout requests</div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <Kpi label="Pending" value={pending.length.toString()} pendingAmount={pending.reduce((a, r) => a + r.amount_cents, 0)} tone="warn" />
        <Kpi label="Paid lifetime" value={paid.length.toString()} pendingAmount={paid.reduce((a, r) => a + r.amount_cents, 0)} />
        <Kpi label="Failed/canceled" value={failed.length.toString()} pendingAmount={failed.reduce((a, r) => a + r.amount_cents, 0)} tone="bad" />
      </div>

      <PayoutTable title="Pending (action required)" rows={pending} showActions />
      <PayoutTable title="Recent history" rows={[...paid, ...failed].slice(0, 100)} />
    </div>
  );
}

function PayoutTable({
  title,
  rows,
  showActions = false,
}: {
  title: string;
  rows: PayoutRow[];
  showActions?: boolean;
}) {
  return (
    <section className="mt-4">
      <div className="font-display text-lg font-bold mb-3">
        {title} <span className="text-white/40 text-sm font-normal">· {rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-white/50 text-sm">Nothing here.</div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden text-sm">
          <table className="w-full">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/50">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Requested</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-right">Fee</th>
                <th className="p-3">Status</th>
                {showActions && <th className="p-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-3">
                    {r.profile ? (
                      <Link href={`/admin/users/${r.user_id}`} className="hover:underline">
                        <div className="font-medium">
                          {r.profile.display_name || r.profile.handle || r.profile.email.split("@")[0]}
                        </div>
                        <div className="text-xs text-white/50">{r.profile.email}</div>
                      </Link>
                    ) : (
                      <span className="text-white/40">{r.user_id.slice(0, 8)}…</span>
                    )}
                  </td>
                  <td className="p-3 text-white/50">{new Date(r.requested_at).toLocaleString()}</td>
                  <td className="p-3 text-right font-semibold">{formatUSD(r.amount_cents)}</td>
                  <td className="p-3 text-right text-white/50">{formatUSD(r.fee_cents)}</td>
                  <td className="p-3">
                    <span
                      className={`chip text-xs ${
                        r.status === "pending"
                          ? "text-brand border-brand/30 bg-brand/10"
                          : r.status === "paid"
                            ? "text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10"
                            : "text-accent-pink border-accent-pink/30 bg-accent-pink/10"
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.failure_reason && (
                      <div className="text-[10px] text-white/40 mt-1 max-w-[220px] truncate">
                        {r.failure_reason}
                      </div>
                    )}
                  </td>
                  {showActions && (
                    <td className="p-3 text-right">
                      <PayoutReviewButtons payoutId={r.id} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  pendingAmount,
  tone,
}: {
  label: string;
  value: string;
  pendingAmount: number;
  tone?: "good" | "bad" | "warn";
}) {
  const color =
    tone === "good" ? "text-accent-cyan" : tone === "bad" ? "text-accent-pink" : tone === "warn" ? "text-brand" : "";
  return (
    <div className="glass-strong rounded-2xl p-4">
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className={`font-display text-2xl font-black mt-1 ${color}`}>{value}</div>
      <div className="text-xs text-white/50 mt-0.5">{formatUSD(pendingAmount)}</div>
    </div>
  );
}
