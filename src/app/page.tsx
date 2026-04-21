import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";

export const revalidate = 30;

type PackRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  price_cents: number;
  theme_color: string | null;
  sort_order: number;
};

export default async function HomePage() {
  const admin = createSupabaseAdmin();
  const { data: packs } = await admin
    .from("packs")
    .select("id,slug,name,tagline,price_cents,theme_color,sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 pt-24 pb-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="chip mb-6 text-brand border-brand/30 bg-brand/10">
              <span className="text-brand">●</span>
              Provably fair. Real cards. Real money.
            </div>
            <h1 className="font-display text-5xl md:text-7xl font-black leading-[1.05] tracking-tight">
              Rip packs.<br />
              <span className="shimmer-text">Pull legends.</span>
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-xl">
              Pick a tier from $1 to $100. Every rip has a verifiable chance at
              vault-grade Pokémon cards. Ship them home or cash out instantly via ACH.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <Link href="/packs" className="btn-primary text-base">
                Start ripping →
              </Link>
              <Link href="/fairness" className="btn-ghost text-base">
                How odds work
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm text-white/50">
              <div><span className="text-white font-semibold">18+</span> only</div>
              <div><span className="text-white font-semibold">ACH</span> payouts</div>
              <div><span className="text-white font-semibold">Shipped</span> in bubble mailer + top-loader</div>
            </div>
          </div>

          {/* Decorative pack stack */}
          <div className="relative h-[420px] hidden lg:block">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="absolute inset-0 m-auto w-64 h-96 rounded-3xl glass-strong"
                style={{
                  transform: `translate(${(i - 1.5) * 42}px, ${Math.abs(i - 1.5) * 14}px) rotate(${(i - 1.5) * 8}deg)`,
                  boxShadow: `0 40px 80px -30px rgba(0,0,0,0.8), 0 0 60px -20px ${["#5ab0ff", "#b86cff", "#ff2d95", "#ffb84d"][i]}`,
                }}
              >
                <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                  <div className="text-5xl mb-2">🎴</div>
                  <div className="font-display font-bold text-lg">TIER {[1, 10, 25, 100][i]}</div>
                  <div className="text-xs text-white/50 mt-1">Sealed • Randomized</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pack tiers */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-display text-3xl md:text-4xl font-bold">Pick your tier</h2>
            <p className="text-white/60 mt-2">Higher tier = higher expected value and spicier chase cards.</p>
          </div>
          <Link href="/packs" className="text-sm text-brand hover:underline">
            See all packs →
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(packs as PackRow[] | null)?.map((p) => (
            <Link
              key={p.id}
              href={`/packs/${p.slug}`}
              className="card-tile p-6 group"
              style={{ boxShadow: `0 0 60px -25px ${p.theme_color ?? "#8a5cff"}` }}
            >
              <div
                className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity pointer-events-none"
                style={{ background: `radial-gradient(circle at 50% 0%, ${p.theme_color ?? "#8a5cff"}, transparent 60%)` }}
              />
              <div className="relative">
                <div className="text-5xl mb-4">🎴</div>
                <div className="text-xs uppercase tracking-widest text-white/40">{p.slug}</div>
                <div className="font-display text-2xl font-bold mt-1">{p.name}</div>
                <div className="text-white/50 text-sm mt-1">{p.tagline}</div>
                <div className="mt-5 flex items-center justify-between">
                  <div className="font-display text-3xl font-black">{formatUSD(p.price_cents)}</div>
                  <div className="text-sm text-white/60 group-hover:text-white transition">Open →</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-center">How it works</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-4">
          {[
            { n: 1, t: "Deposit", d: "Load your wallet with a card or bank transfer. No minimums above $1." },
            { n: 2, t: "Pick a tier", d: "$1 through $100. Each tier has its own weighted loot table with published odds." },
            { n: 3, t: "Rip the pack", d: "Animated reveal shows your pull live. Every roll is cryptographically verifiable." },
            { n: 4, t: "Ship or cash out", d: "Ship the physical card to your door, or sell it back instantly and ACH out." },
          ].map((s) => (
            <div key={s.n} className="glass p-6 rounded-2xl">
              <div className="w-10 h-10 rounded-full bg-brand text-black font-bold flex items-center justify-center mb-4">
                {s.n}
              </div>
              <div className="font-display text-xl font-bold">{s.t}</div>
              <div className="text-white/60 text-sm mt-2">{s.d}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
