import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { InventoryGrid } from "@/components/inventory-grid";

export const dynamic = "force-dynamic";

type UnitRow = {
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

export default async function InventoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("card_units")
    .select(
      "id, state, card:cards(id, name, rarity, image_url, set_name, market_value_cents)",
    )
    .eq("owned_by_user", user.id)
    .in("state", ["held", "ship_requested", "shipped"])
    .order("updated_at", { ascending: false });

  const units = (data as UnitRow[] | null) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold">Inventory</h1>
          <p className="text-white/60 mt-1">
            Your pulled cards. Ship them home or sell them back to the house.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-white/40">Held value</div>
          <div className="font-display text-2xl font-bold">
            ${(
              units
                .filter((u) => u.state === "held")
                .reduce((acc, u) => acc + u.card.market_value_cents, 0) / 100
            ).toFixed(2)}
          </div>
        </div>
      </header>

      <div className="mt-10">
        <InventoryGrid units={units} />
      </div>
    </div>
  );
}
