import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminPacks() {
  const admin = createSupabaseAdmin();
  const { data: packs } = await admin
    .from("packs")
    .select("id, slug, name, price_cents, expected_value_cents, max_payout_cents, active")
    .order("sort_order", { ascending: true });

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Packs &amp; loot tables</h1>
      <p className="text-white/60 mt-1 text-sm">
        Run <code>npm run db:seed</code> to bootstrap loot tables. Edit cards/weights in the SQL
        editor for now — a full admin editor is next.
      </p>

      <div className="mt-6 grid gap-4">
        {(packs ?? []).map((p) => {
          const ev = Number(p.expected_value_cents);
          const price = Number(p.price_cents);
          const rtp = price > 0 ? (ev / price) * 100 : 0;
          return (
            <div key={p.id} className="glass rounded-2xl p-5 flex flex-wrap items-center gap-6 justify-between">
              <div>
                <div className="font-display text-xl font-bold">{p.name}</div>
                <div className="text-xs text-white/50">{p.slug} · {p.active ? "active" : "inactive"}</div>
              </div>
              <div className="flex gap-6 text-sm">
                <Kv k="Price" v={formatUSD(p.price_cents)} />
                <Kv k="EV" v={formatUSD(p.expected_value_cents)} />
                <Kv k="RTP" v={`${rtp.toFixed(1)}%`} />
                <Kv k="Max payout" v={formatUSD(p.max_payout_cents)} />
              </div>
              <Link href={`/admin/packs/${p.slug}`} className="btn-ghost text-sm">Edit →</Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-white/40">{k}</div>
      <div className="font-semibold">{v}</div>
    </div>
  );
}
