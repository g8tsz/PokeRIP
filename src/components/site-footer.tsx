import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6 py-10 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <div className="font-display text-lg font-bold mb-2">PokéRip</div>
          <p className="text-white/50 max-w-xs">
            Rip virtual Pokémon packs for real physical cards. Ship home or cash out via ACH.
            Provably fair — every roll is verifiable.
          </p>
        </div>
        <div>
          <div className="text-white/80 font-medium mb-2">Play</div>
          <ul className="space-y-1 text-white/50">
            <li><Link href="/packs">Packs</Link></li>
            <li><Link href="/inventory">Inventory</Link></li>
            <li><Link href="/fairness">Provably Fair</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-white/80 font-medium mb-2">Money</div>
          <ul className="space-y-1 text-white/50">
            <li><Link href="/wallet">Wallet</Link></li>
            <li><Link href="/payouts">ACH Payouts</Link></li>
            <li><Link href="/shipping">Shipping</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-white/80 font-medium mb-2">Legal</div>
          <ul className="space-y-1 text-white/50">
            <li><Link href="/terms">Terms</Link></li>
            <li><Link href="/privacy">Privacy</Link></li>
            <li><Link href="/responsible-play">Responsible Play</Link></li>
            <li><Link href="/unavailable">Unavailable in my state?</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5 py-6 text-center text-xs text-white/40">
        18+ only where legal. PokéRip is not affiliated with Nintendo, The Pokémon Company, or
        Wizards of the Coast. Play responsibly.
      </div>
    </footer>
  );
}
