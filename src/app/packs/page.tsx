import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";

export const revalidate = 30;

export default async function PacksPage() {
  const admin = createSupabaseAdmin();
  const { data: packs } = await admin
    .from("packs")
    .select("id,slug,name,tagline,description,price_cents,theme_color")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-10">
        <h1 className="font-display text-4xl md:text-5xl font-bold">All packs</h1>
        <p className="text-white/60 mt-2">Pick your variance. Click a pack to see the full odds table.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {packs?.map((p) => (
          <Link
            key={p.id}
            href={`/packs/${p.slug}`}
            className="card-tile p-6 group relative"
            style={{ boxShadow: `0 0 80px -30px ${p.theme_color ?? "#8a5cff"}` }}
          >
            <div
              className="absolute inset-0 pointer-events-none opacity-25 group-hover:opacity-40 transition-opacity"
              style={{ background: `radial-gradient(circle at 50% 0%, ${p.theme_color ?? "#8a5cff"}, transparent 65%)` }}
            />
            <div className="relative">
              <div className="text-6xl mb-6">🎴</div>
              <div className="font-display text-2xl font-bold">{p.name}</div>
              <div className="text-white/50 text-sm mt-1">{p.tagline}</div>
              <p className="text-white/60 text-sm mt-4 line-clamp-3">{p.description}</p>
              <div className="mt-6 flex items-center justify-between">
                <div className="font-display text-3xl font-black">{formatUSD(p.price_cents)}</div>
                <div className="text-brand group-hover:translate-x-1 transition-transform">Open →</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
