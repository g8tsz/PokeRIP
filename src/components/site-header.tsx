import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { WalletBadge } from "@/components/wallet-badge";

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-display font-bold text-xl">
            <span className="text-2xl">🎴</span>
            <span className="shimmer-text">PokéRip</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-white/70">
            <Link href="/packs" className="hover:text-white transition">Packs</Link>
            {user && (
              <Link href="/dashboard" className="hover:text-white transition">Dashboard</Link>
            )}
            <Link href="/inventory" className="hover:text-white transition">Inventory</Link>
            <Link href="/wallet" className="hover:text-white transition">Wallet</Link>
            <Link href="/fairness" className="hover:text-white transition">Provably Fair</Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <WalletBadge userId={user.id} />
              <Link href="/dashboard" className="btn-ghost text-sm">
                {user.email?.split("@")[0] ?? "Dashboard"}
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm text-white/70 hover:text-white">
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary text-sm">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
