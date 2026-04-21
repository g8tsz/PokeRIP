"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { formatUSD } from "@/lib/utils";

type Card = {
  id: string;
  name: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
  image_url: string | null;
  set_name: string | null;
  market_value_cents: number;
};

type OpenResult = {
  opening_id: string;
  card: Card;
  payout_value_cents: number;
  balance_after_cents: number;
  provably_fair: {
    server_seed_hash: string;
    client_seed: string;
    nonce: number;
    roll_hash: string;
    roll_value: number;
  };
  rewards_preview: { id: string; card_id: string; weight: number }[];
};

export function OpenPackClient({
  packId,
  packSlug,
  priceCents,
}: {
  packId: string;
  packSlug: string;
  priceCents: number;
}) {
  const [state, setState] = useState<"idle" | "spinning" | "revealed" | "error">("idle");
  const [result, setResult] = useState<OpenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rewardCards, setRewardCards] = useState<Record<string, Card>>({});
  const [clientSeed, setClientSeed] = useState<string>("");

  async function open() {
    setError(null);
    setState("spinning");
    try {
      const res = await fetch("/api/packs/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pack_id: packId, client_seed: clientSeed || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(prettyError(data?.error));
        setState("error");
        return;
      }
      // Fetch metadata for all possible rewards so we can render the reel.
      const cardIds = Array.from(new Set(data.rewards_preview.map((r: { card_id: string }) => r.card_id)));
      const metaRes = await fetch(`/api/cards/meta?ids=${cardIds.join(",")}`);
      const meta = (await metaRes.json()) as { cards: Card[] };
      const map: Record<string, Card> = {};
      for (const c of meta.cards) map[c.id] = c;
      setRewardCards(map);
      setResult(data);
      // small delay lets the reel mount before the animation starts
      setTimeout(() => setState("revealed"), 50);
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  function reset() {
    setState("idle");
    setResult(null);
    setError(null);
    setRewardCards({});
  }

  return (
    <div>
      {state === "idle" && (
        <IdleView
          priceCents={priceCents}
          onOpen={open}
          clientSeed={clientSeed}
          setClientSeed={setClientSeed}
        />
      )}

      {(state === "spinning" || state === "revealed") && result && (
        <SpinningView
          result={result}
          rewardCards={rewardCards}
          packSlug={packSlug}
          revealed={state === "revealed"}
          onAgain={reset}
        />
      )}

      {state === "error" && (
        <div className="p-6 text-center">
          <div className="text-2xl mb-2">⚠️</div>
          <div className="font-semibold text-accent-pink">{error}</div>
          <button className="btn-ghost mt-4" onClick={reset}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function IdleView({
  priceCents,
  onOpen,
  clientSeed,
  setClientSeed,
}: {
  priceCents: number;
  onOpen: () => void;
  clientSeed: string;
  setClientSeed: (s: string) => void;
}) {
  return (
    <div className="grid md:grid-cols-[1fr_auto] gap-8 items-center">
      <div>
        <div className="text-sm uppercase tracking-widest text-white/40">Ready to rip</div>
        <div className="font-display text-3xl md:text-4xl font-bold mt-1">
          One rip for {formatUSD(priceCents)}.
        </div>
        <p className="text-white/60 mt-3 max-w-lg">
          Click &ldquo;Rip&rdquo; to deduct from your wallet and pull a random card from this pack&rsquo;s
          loot table. Every roll uses a pre-committed server seed — verify in{" "}
          <a href="/fairness" className="underline">Provably Fair</a>.
        </p>

        <div className="mt-5">
          <label className="text-xs uppercase tracking-widest text-white/40">
            Client seed (optional — change any time to mix the outcome)
          </label>
          <input
            type="text"
            value={clientSeed}
            onChange={(e) => setClientSeed(e.target.value)}
            placeholder="leave blank to use default"
            className="mt-1 w-full md:w-80 bg-bg-soft border border-white/10 rounded-xl px-4 py-2 text-sm"
          />
        </div>
      </div>

      <button
        onClick={onOpen}
        className="btn-primary text-lg px-8 py-4 font-display font-bold animate-pulse-glow"
      >
        RIP PACK → {formatUSD(priceCents)}
      </button>
    </div>
  );
}

function SpinningView({
  result,
  rewardCards,
  packSlug,
  revealed,
  onAgain,
}: {
  result: OpenResult;
  rewardCards: Record<string, Card>;
  packSlug: string;
  revealed: boolean;
  onAgain: () => void;
}) {
  // Build a long reel of weighted random cards with the winning card at a known index.
  const { reel, winIndex } = useMemo(() => buildReel(result, rewardCards), [result, rewardCards]);
  const controls = useAnimation();
  const reelRef = useRef<HTMLDivElement | null>(null);
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    if (!reelRef.current) return;
    const CARD_W = 160;
    const GAP = 12;
    const step = CARD_W + GAP;
    const containerWidth = reelRef.current.parentElement?.clientWidth ?? 800;
    // Target: center the winning card under the pointer.
    const target = -(winIndex * step) + containerWidth / 2 - CARD_W / 2;
    // Add a small random wobble so it doesn't always land dead-center.
    const jitter = (Math.random() - 0.5) * (CARD_W * 0.55);
    const finalX = target + jitter;

    controls
      .start({
        x: finalX,
        transition: {
          duration: 6.2,
          ease: [0.08, 0.65, 0.12, 1.0],
        },
      })
      .then(() => setAnimDone(true));
  }, [controls, winIndex]);

  const showOverlay = animDone && revealed;

  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-2xl bg-bg/60 border border-white/10 h-[230px]">
        {/* Center pointer */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-brand z-20 -translate-x-1/2 pointer-events-none">
          <div className="absolute -top-1 -left-2 w-5 h-5 bg-brand rotate-45" />
          <div className="absolute -bottom-1 -left-2 w-5 h-5 bg-brand rotate-45" />
        </div>
        {/* Edge fades */}
        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-bg to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-bg to-transparent z-10 pointer-events-none" />

        <motion.div
          ref={reelRef}
          animate={controls}
          initial={{ x: 0 }}
          className="flex gap-3 items-center h-full px-4"
          style={{ willChange: "transform" }}
        >
          {reel.map((c, i) => (
            <ReelCard key={i} card={c} />
          ))}
        </motion.div>
      </div>

      {/* Reveal overlay */}
      {showOverlay && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="mt-8 glass-strong rounded-3xl p-8 flex flex-col md:flex-row items-center gap-8"
          style={{ boxShadow: `0 0 80px -20px ${rarityGlow(result.card.rarity)}` }}
        >
          <div className="w-48 h-72 rounded-2xl overflow-hidden bg-bg-elev flex-shrink-0"
               style={{ boxShadow: `0 0 60px -10px ${rarityGlow(result.card.rarity)}` }}>
            {result.card.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.card.image_url} alt={result.card.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-6xl">🎴</div>
            )}
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className={`text-sm uppercase tracking-widest font-semibold text-rarity-${result.card.rarity}`}>
              {result.card.rarity}
            </div>
            <div className="font-display text-4xl md:text-5xl font-black mt-1">{result.card.name}</div>
            <div className="text-white/50 text-sm mt-1">{result.card.set_name}</div>

            <div className="mt-6 grid grid-cols-2 gap-4 max-w-md">
              <div className="glass rounded-xl p-3">
                <div className="text-xs uppercase tracking-widest text-white/40">Value</div>
                <div className="font-display text-2xl font-bold">
                  {formatUSD(result.payout_value_cents)}
                </div>
              </div>
              <div className="glass rounded-xl p-3">
                <div className="text-xs uppercase tracking-widest text-white/40">Wallet now</div>
                <div className="font-display text-2xl font-bold">
                  {formatUSD(result.balance_after_cents)}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3 justify-center md:justify-start">
              <button className="btn-primary" onClick={onAgain}>
                Rip again
              </button>
              <a href="/inventory" className="btn-ghost">
                View inventory
              </a>
              <a
                href={`/fairness/${result.opening_id}`}
                className="btn-ghost text-xs"
                title="See the seeds & hash used for this roll"
              >
                Verify roll
              </a>
            </div>
            <div className="text-[11px] text-white/30 mt-4 font-mono break-all">
              seed_hash: {result.provably_fair.server_seed_hash.slice(0, 16)}… · nonce:{" "}
              {result.provably_fair.nonce} · roll: {result.provably_fair.roll_value.toFixed(6)}
            </div>
          </div>
        </motion.div>
      )}

      <div className="mt-4 text-center text-xs text-white/30">
        Pack: {packSlug} · Rolling against {result.rewards_preview.length} outcomes
      </div>
    </div>
  );
}

function ReelCard({ card }: { card: Card | undefined }) {
  if (!card) {
    return (
      <div className="w-[160px] h-[210px] rounded-xl bg-bg-elev/70 border border-white/5 flex-shrink-0" />
    );
  }
  return (
    <div
      className="w-[160px] h-[210px] rounded-xl bg-bg-elev flex-shrink-0 overflow-hidden relative border border-white/5"
      style={{ boxShadow: `0 0 20px -8px ${rarityGlow(card.rarity)}` }}
    >
      {card.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full grid place-items-center text-5xl">🎴</div>
      )}
      <div className={`absolute top-1 right-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-black/60 text-rarity-${card.rarity}`}>
        {card.rarity}
      </div>
    </div>
  );
}

function rarityGlow(r: Card["rarity"]): string {
  return {
    common: "#b0b0b0",
    uncommon: "#5ce1a7",
    rare: "#5ab0ff",
    epic: "#b86cff",
    legendary: "#ffb84d",
    mythic: "#ff4d6d",
  }[r];
}

function buildReel(result: OpenResult, rewardCards: Record<string, Card>) {
  const REEL_LEN = 80;
  const WIN_INDEX = 62; // ~78% of the way through
  const pool = result.rewards_preview;
  const totalWeight = pool.reduce((a, r) => a + r.weight, 0);

  function pickRandomCard(): Card | undefined {
    const x = Math.random() * totalWeight;
    let acc = 0;
    for (const r of pool) {
      acc += r.weight;
      if (x < acc) return rewardCards[r.card_id];
    }
    return rewardCards[pool[pool.length - 1]!.card_id];
  }

  const reel: (Card | undefined)[] = [];
  for (let i = 0; i < REEL_LEN; i++) {
    if (i === WIN_INDEX) {
      reel.push(result.card);
    } else {
      reel.push(pickRandomCard());
    }
  }
  return { reel, winIndex: WIN_INDEX };
}

function prettyError(code: string | undefined): string {
  switch (code) {
    case "insufficient_funds":
      return "Not enough in your wallet. Top up to rip.";
    case "pack_not_found":
    case "pack_not_found_or_inactive":
      return "This pack isn't available right now.";
    case "pack_empty":
      return "This pack has no rewards configured yet.";
    case "reward_sold_out":
      return "That card is sold out. Hit rip again to roll a different reward.";
    case "unauthorized":
      return "Sign in to rip.";
    default:
      return code || "Something went wrong.";
  }
}
