import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminShipments() {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("shipments")
    .select(
      "id, status, created_at, insured_value_cents, shipping_fee_cents, user_id, address:addresses(name, line1, city, region, postal_code)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Shipments</h1>
      <div className="text-sm text-white/50 mb-6">Most recent 100 fulfillment requests</div>

      <div className="glass rounded-2xl overflow-hidden text-sm">
        <table className="w-full">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-white/50">
            <tr>
              <th className="p-3">Time</th>
              <th className="p-3">Status</th>
              <th className="p-3">Ship to</th>
              <th className="p-3">Insured value</th>
              <th className="p-3">Fee</th>
            </tr>
          </thead>
          <tbody>
            {(((data as unknown) as Array<{
              id: string;
              status: string;
              created_at: string;
              insured_value_cents: number;
              shipping_fee_cents: number;
              address: { name: string; line1: string; city: string; region: string; postal_code: string } | null;
            }>) ?? []).map((s) => (
              <tr key={s.id} className="border-t border-white/5">
                <td className="p-3 text-white/50">{new Date(s.created_at).toLocaleString()}</td>
                <td className="p-3 capitalize">{s.status}</td>
                <td className="p-3">
                  {s.address
                    ? `${s.address.name}, ${s.address.line1}, ${s.address.city} ${s.address.region} ${s.address.postal_code}`
                    : "—"}
                </td>
                <td className="p-3">{formatUSD(s.insured_value_cents)}</td>
                <td className="p-3">{formatUSD(s.shipping_fee_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
