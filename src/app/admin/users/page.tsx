import Link from "next/link";
import { getUserMetrics } from "@/lib/admin-data";
import { formatUSD } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; desc?: string }>;
}) {
  const { q, sort, desc } = await searchParams;
  const allowedSort = ["created_at", "total_spent_cents", "balance_cents", "last_rip_at"] as const;
  const orderBy = (allowedSort as readonly string[]).includes(sort ?? "")
    ? (sort as (typeof allowedSort)[number])
    : "created_at";
  const isDesc = desc !== "0";

  const users = await getUserMetrics({
    search: q,
    orderBy,
    desc: isDesc,
    limit: 200,
  });

  return (
    <div>
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Users</h1>
          <div className="text-sm text-white/50">{users.length} shown · max 200</div>
        </div>
        <form method="get" className="flex gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search email, handle, name…"
            className="bg-bg-soft border border-white/10 rounded-xl px-4 py-2 text-sm w-72"
          />
          <select
            name="sort"
            defaultValue={orderBy}
            className="bg-bg-soft border border-white/10 rounded-xl px-3 py-2 text-sm"
          >
            <option value="created_at">Newest</option>
            <option value="total_spent_cents">Top spenders</option>
            <option value="balance_cents">Biggest wallet</option>
            <option value="last_rip_at">Recently active</option>
          </select>
          <button className="btn-ghost text-sm">Apply</button>
        </form>
      </header>

      <div className="glass rounded-2xl overflow-hidden text-sm">
        <table className="w-full">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/50">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3 text-right">Wallet</th>
              <th className="p-3 text-right">Deposited</th>
              <th className="p-3 text-right">Withdrew</th>
              <th className="p-3 text-right">Rips</th>
              <th className="p-3 text-right">Spent</th>
              <th className="p-3 text-right">Pulled</th>
              <th className="p-3">Joined</th>
              <th className="p-3">KYC</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const net = u.total_pulled_value_cents - u.total_spent_cents;
              return (
                <tr key={u.id} className="border-t border-white/5">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {u.blocked && <span className="chip text-accent-pink border-accent-pink/30 bg-accent-pink/10 text-[10px]">BLOCKED</span>}
                      <div>
                        <div className="font-medium truncate max-w-[240px]">
                          {u.display_name || u.handle || u.email.split("@")[0]}
                        </div>
                        <div className="text-xs text-white/50 truncate max-w-[240px]">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-right font-semibold">{formatUSD(u.balance_cents)}</td>
                  <td className="p-3 text-right">{formatUSD(u.lifetime_deposit_cents)}</td>
                  <td className="p-3 text-right">{formatUSD(u.lifetime_withdraw_cents)}</td>
                  <td className="p-3 text-right">{u.rips.toLocaleString()}</td>
                  <td className="p-3 text-right">{formatUSD(u.total_spent_cents)}</td>
                  <td className={`p-3 text-right ${net >= 0 ? "text-accent-cyan" : "text-white/70"}`}>
                    {formatUSD(u.total_pulled_value_cents)}
                  </td>
                  <td className="p-3 text-white/50 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    {u.kyc_verified ? (
                      <span className="chip text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10 text-[10px]">✓</span>
                    ) : (
                      <span className="text-white/30 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Link href={`/admin/users/${u.id}`} className="text-brand text-xs hover:underline">
                      Manage →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={10} className="p-10 text-center text-white/50">
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
