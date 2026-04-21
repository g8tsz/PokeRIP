import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD, formatOdds } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminPackDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const admin = createSupabaseAdmin();
  const { data: pack } = await admin.from("packs").select("*").eq("slug", slug).maybeSingle();
  if (!pack) notFound();

  const { data: rewardsRaw } = await admin
    .from("pack_rewards")
    .select("id, weight, max_supply, awarded_count, card:cards(name, rarity, market_value_cents)")
    .eq("pack_id", pack.id)
    .order("weight", { ascending: false });

  const rewards = (rewardsRaw as Array<{
    id: string;
    weight: number;
    max_supply: number | null;
    awarded_count: number;
    card: { name: string; rarity: string; market_value_cents: number };
  }> | null) ?? [];

  const totalWeight = rewards.reduce((a, r) => a + r.weight, 0);

  return (
    <div>
      <Link href="/admin/packs" className="text-sm text-white/50">← Packs</Link>
      <h1 className="font-display text-3xl font-bold mt-2">{pack.name}</h1>
      <div className="text-sm text-white/50 mb-6">{pack.slug} · {formatUSD(pack.price_cents)}</div>

      <div className="glass rounded-2xl overflow-hidden text-sm">
        <table className="w-full">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/50">
            <tr>
              <th className="p-3">Card</th>
              <th className="p-3">Rarity</th>
              <th className="p-3">Value</th>
              <th className="p-3">Weight</th>
              <th className="p-3">Odds</th>
              <th className="p-3">Awarded</th>
              <th className="p-3">Supply cap</th>
            </tr>
          </thead>
          <tbody>
            {rewards.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="p-3">{r.card.name}</td>
                <td className={`p-3 text-rarity-${r.card.rarity}`}>{r.card.rarity}</td>
                <td className="p-3">{formatUSD(r.card.market_value_cents)}</td>
                <td className="p-3 font-mono">{r.weight}</td>
                <td className="p-3">{formatOdds(r.weight, totalWeight)}</td>
                <td className="p-3 text-white/60">{r.awarded_count}</td>
                <td className="p-3 text-white/60">{r.max_supply ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
