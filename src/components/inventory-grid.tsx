"use client";

import { useMemo, useState } from "react";
import { formatUSD } from "@/lib/utils";

type Unit = {
  id: string;
  state: "held" | "ship_requested" | "shipped" | "sold_back" | "voided";
  card: {
    id: string;
    name: string;
    rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
    image_url: string | null;
    set_name: string | null;
    market_value_cents: number;
  };
};

const SELLBACK_RATE = 0.7; // 70% of market value

export function InventoryGrid({ units }: { units: Unit[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "held" | "shipping">("all");
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () =>
      units.filter((u) =>
        filter === "all"
          ? true
          : filter === "held"
            ? u.state === "held"
            : u.state === "ship_requested" || u.state === "shipped",
      ),
    [units, filter],
  );

  const selectedUnits = useMemo(
    () => units.filter((u) => selected.has(u.id) && u.state === "held"),
    [units, selected],
  );
  const selectedValue = selectedUnits.reduce((acc, u) => acc + u.card.market_value_cents, 0);
  const sellbackValue = Math.round(selectedValue * SELLBACK_RATE);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function sellback() {
    if (!selectedUnits.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/sellback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unit_ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "sellback_failed");
      location.reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function ship() {
    if (!selectedUnits.length) return;
    location.href = `/shipping?ids=${Array.from(selected).join(",")}`;
  }

  if (units.length === 0) {
    return (
      <div className="glass rounded-3xl p-16 text-center text-white/60">
        <div className="text-5xl mb-3">🫙</div>
        No cards yet. Head to <a className="underline" href="/packs">Packs</a> and rip one.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex gap-2">
          {(["all", "held", "shipping"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`chip ${filter === f ? "border-brand/60 bg-brand/10 text-brand" : ""}`}
            >
              {f === "all" ? "All" : f === "held" ? "Held" : "Shipping"}
            </button>
          ))}
        </div>

        {selectedUnits.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm text-white/60">
              {selectedUnits.length} selected · Market {formatUSD(selectedValue)}
            </div>
            <button
              onClick={sellback}
              disabled={busy}
              className="btn-primary"
              title={`Credit ${formatUSD(sellbackValue)} (70% of market) to your wallet`}
            >
              Sell back → {formatUSD(sellbackValue)}
            </button>
            <button onClick={ship} disabled={busy} className="btn-ghost">
              Ship to me →
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {visible.map((u) => (
          <button
            key={u.id}
            onClick={() => u.state === "held" && toggle(u.id)}
            className={`card-tile text-left p-0 ${selected.has(u.id) ? "ring-2 ring-brand" : ""} ${
              u.state !== "held" ? "opacity-70 cursor-default" : ""
            }`}
          >
            <div className="aspect-[3/4] bg-bg-elev overflow-hidden">
              {u.card.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.card.image_url} alt={u.card.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-6xl">🎴</div>
              )}
            </div>
            <div className="p-3">
              <div className={`text-[10px] uppercase tracking-widest font-semibold text-rarity-${u.card.rarity}`}>
                {u.card.rarity}
              </div>
              <div className="font-medium truncate">{u.card.name}</div>
              <div className="flex items-center justify-between mt-1 text-sm">
                <span className="text-white/50 truncate">{u.card.set_name}</span>
                <span className="font-semibold">{formatUSD(u.card.market_value_cents)}</span>
              </div>
              {u.state !== "held" && (
                <div className="text-[10px] uppercase tracking-widest mt-1 text-accent-cyan">
                  {u.state.replace("_", " ")}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
