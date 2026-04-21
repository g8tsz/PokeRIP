import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminOpenings() {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("openings")
    .select(
      "id, created_at, price_cents, payout_value_cents, user_id, pack:packs(slug, name), card:cards(name, rarity)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Openings log</h1>
      <div className="text-sm text-white/50 mb-6">Most recent 200 rips · real-time feed</div>

      <div className="glass rounded-2xl overflow-hidden text-sm">
        <table className="w-full">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/50">
            <tr>
              <th className="p-3">Time</th>
              <th className="p-3">User</th>
              <th className="p-3">Pack</th>
              <th className="p-3">Pulled</th>
              <th className="p-3">Price</th>
              <th className="p-3">Value</th>
              <th className="p-3">Δ</th>
            </tr>
          </thead>
          <tbody>
            {(((data as unknown) as Array<{
              id: string;
              created_at: string;
              price_cents: number;
              payout_value_cents: number;
              user_id: string;
              pack: { slug: string; name: string };
              card: { name: string; rarity: string };
            }>) ?? []).map((o) => {
              const delta = Number(o.payout_value_cents) - Number(o.price_cents);
              return (
                <tr key={o.id} className="border-t border-white/5">
                  <td className="p-3 text-white/50">{new Date(o.created_at).toLocaleString()}</td>
                  <td className="p-3 font-mono text-xs">
                    <Link href={`/admin/users/${o.user_id}`} className="hover:underline">
                      {o.user_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="p-3">{o.pack.name}</td>
                  <td className="p-3">
                    <span className={`text-rarity-${o.card.rarity}`}>{o.card.rarity}</span>{" "}
                    {o.card.name}
                  </td>
                  <td className="p-3">{formatUSD(o.price_cents)}</td>
                  <td className="p-3">{formatUSD(o.payout_value_cents)}</td>
                  <td className={`p-3 ${delta >= 0 ? "text-accent-cyan" : "text-white/50"}`}>
                    {delta >= 0 ? "+" : ""}
                    {formatUSD(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
