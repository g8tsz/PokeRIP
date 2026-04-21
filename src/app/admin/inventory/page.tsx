import { getCardInventory } from "@/lib/admin-data";
import { formatUSD } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

export default async function AdminInventory() {
  const inventory = await getCardInventory();

  const lowStock = inventory.filter((c) => c.held_free === 0 && c.rarity !== "common");
  const totalHeldValue = inventory.reduce((a, c) => a + c.held_free * c.market_value_cents, 0);
  const totalAllocatedValue = inventory.reduce((a, c) => a + c.allocated * c.market_value_cents, 0);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">Inventory</h1>
        <div className="text-sm text-white/50">Stock levels across every card in the pool</div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Kpi label="Cards tracked" value={inventory.length.toLocaleString()} />
        <Kpi label="Free stock value" value={formatUSD(totalHeldValue)} sub="Ready to award" />
        <Kpi label="Held by users" value={formatUSD(totalAllocatedValue)} sub="In user inventories" tone="warn" />
        <Kpi
          label="Low stock (non-common)"
          value={lowStock.length.toString()}
          tone={lowStock.length > 0 ? "bad" : "good"}
        />
      </div>

      {lowStock.length > 0 && (
        <div className="mb-6 glass rounded-2xl p-4 border border-accent-pink/30">
          <div className="text-sm font-semibold text-accent-pink mb-2">⚠ Out-of-stock chase cards</div>
          <div className="flex flex-wrap gap-2 text-xs">
            {lowStock.slice(0, 20).map((c) => (
              <span key={c.id} className={`chip text-rarity-${c.rarity as Rarity} border-white/10`}>
                {c.name}
              </span>
            ))}
            {lowStock.length > 20 && <span className="chip">+{lowStock.length - 20} more</span>}
          </div>
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden text-sm">
        <table className="w-full">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/50">
            <tr>
              <th className="p-3">Card</th>
              <th className="p-3">Rarity</th>
              <th className="p-3 text-right">Value</th>
              <th className="p-3 text-right">Free stock</th>
              <th className="p-3 text-right">Allocated</th>
              <th className="p-3 text-right">Shipped</th>
              <th className="p-3 text-right">Sold back</th>
              <th className="p-3 text-right">Total ever</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((c) => {
              const outOfStock = c.held_free === 0 && c.rarity !== "common";
              return (
                <tr
                  key={c.id}
                  className={`border-t border-white/5 ${outOfStock ? "bg-accent-pink/5" : ""}`}
                >
                  <td className="p-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-white/40">{c.set_name}</div>
                  </td>
                  <td className="p-3">
                    <span className={`text-rarity-${c.rarity as Rarity} text-xs uppercase font-semibold`}>
                      {c.rarity}
                    </span>
                  </td>
                  <td className="p-3 text-right">{formatUSD(c.market_value_cents)}</td>
                  <td
                    className={`p-3 text-right font-medium ${
                      outOfStock ? "text-accent-pink" : c.held_free < 3 ? "text-brand" : "text-accent-cyan"
                    }`}
                  >
                    {c.held_free}
                  </td>
                  <td className="p-3 text-right text-white/70">{c.allocated}</td>
                  <td className="p-3 text-right text-white/60">{c.shipped}</td>
                  <td className="p-3 text-right text-white/60">{c.sold_back}</td>
                  <td className="p-3 text-right text-white/40">{c.total_units}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "warn";
}) {
  const color =
    tone === "good" ? "text-accent-cyan" : tone === "bad" ? "text-accent-pink" : tone === "warn" ? "text-brand" : "text-white";
  return (
    <div className="glass-strong rounded-2xl p-4">
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className={`font-display text-2xl font-black mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-white/50 mt-0.5">{sub}</div>}
    </div>
  );
}
