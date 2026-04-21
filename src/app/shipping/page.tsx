import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { ShippingForm } from "@/components/shipping-form";
import { formatUSD } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Unit = {
  id: string;
  card: { name: string; image_url: string | null; market_value_cents: number };
};

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { ids } = await searchParams;
  const unitIds = (ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const admin = createSupabaseAdmin();

  const [{ data: units }, { data: addresses }] = await Promise.all([
    unitIds.length
      ? admin
          .from("card_units")
          .select("id, state, card:cards(name, image_url, market_value_cents)")
          .in("id", unitIds)
          .eq("owned_by_user", user.id)
          .eq("state", "held")
      : Promise.resolve({ data: [] as Unit[] }),
    admin
      .from("addresses")
      .select("id, name, line1, line2, city, region, postal_code, country, is_default")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false }),
  ]);

  const totalValue = ((units as Unit[] | null) ?? []).reduce(
    (acc, u) => acc + u.card.market_value_cents,
    0,
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-4xl font-bold">Ship to me</h1>
      <p className="text-white/60 mt-2">
        Bubble mailer + top-loader for orders under $100. Tracked/insured above that.
      </p>

      <section className="mt-8 glass-strong rounded-2xl p-6">
        <div className="font-semibold mb-3">Cards to ship</div>
        {unitIds.length === 0 ? (
          <p className="text-white/60 text-sm">
            No cards selected. Go to{" "}
            <a className="underline" href="/inventory">Inventory</a> and pick some.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {((units as Unit[] | null) ?? []).map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl bg-white/5">
                <div className="w-10 h-14 bg-bg-elev rounded overflow-hidden">
                  {u.card.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.card.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-xl">🎴</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{u.card.name}</div>
                  <div className="text-xs text-white/50">{formatUSD(u.card.market_value_cents)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 text-sm text-white/70">
          Total value: <span className="font-semibold">{formatUSD(totalValue)}</span>
        </div>
      </section>

      <section className="mt-8">
        <ShippingForm
          unitIds={unitIds}
          addresses={(addresses as Array<{
            id: string;
            name: string;
            line1: string;
            line2: string | null;
            city: string;
            region: string;
            postal_code: string;
            country: string;
            is_default: boolean;
          }> | null) ?? []}
          totalValueCents={totalValue}
        />
      </section>
    </div>
  );
}
