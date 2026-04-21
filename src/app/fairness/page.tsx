import { FairnessVerifier } from "@/components/fairness-verifier";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { RotateSeedButton } from "@/components/rotate-seed-button";

export const dynamic = "force-dynamic";

export default async function FairnessPage() {
  const user = await getSessionUser();

  let activeSeed: { seed_hash: string; nonce: number } | null = null;
  let pastSeeds: Array<{ id: string; seed_hash: string; seed_plain: string | null; nonce: number; revealed_at: string | null }> =
    [];

  if (user) {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("server_seeds")
      .select("id, seed_hash, seed_plain, nonce, active, revealed_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = data ?? [];
    const activeRow = rows.find((r) => r.active);
    activeSeed = activeRow ? { seed_hash: activeRow.seed_hash, nonce: activeRow.nonce } : null;
    pastSeeds = rows
      .filter((r) => !r.active)
      .map((r) => ({
        id: r.id,
        seed_hash: r.seed_hash,
        seed_plain: r.seed_plain,
        nonce: r.nonce,
        revealed_at: r.revealed_at,
      }));
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-4xl font-bold">Provably fair</h1>
      <p className="text-white/60 mt-2 max-w-2xl">
        Every roll on PokéRip is cryptographically verifiable. You can&apos;t know the server
        seed until after we&apos;ve committed to it, and we can&apos;t change it after a roll.
      </p>

      <section className="mt-10 glass-strong rounded-2xl p-6">
        <h2 className="font-display text-2xl font-bold mb-3">How it works</h2>
        <ol className="list-decimal list-inside space-y-2 text-white/70 text-sm leading-relaxed">
          <li>
            Before your first rip, we generate a random <code>server_seed</code> and publish{" "}
            <code>server_seed_hash = sha256(server_seed)</code>. The plain seed stays secret.
          </li>
          <li>
            Each rip uses an HMAC-SHA256 of <code>server_seed</code> keyed by{" "}
            <code>client_seed:nonce</code>. We record the hash + first 8 bytes as a float in [0,1).
          </li>
          <li>That float picks the reward from the pack&apos;s weighted loot table.</li>
          <li>
            When you rotate your seed, we reveal the plain <code>server_seed</code>. Anyone can
            verify past rolls using the verifier below.
          </li>
        </ol>
      </section>

      {user ? (
        <>
          <section className="mt-10 glass-strong rounded-2xl p-6">
            <h2 className="font-display text-2xl font-bold mb-3">Your active seed</h2>
            {activeSeed ? (
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-white/50">server_seed_hash:</span>{" "}
                  <span className="font-mono break-all">{activeSeed.seed_hash}</span>
                </div>
                <div>
                  <span className="text-white/50">nonce:</span> {activeSeed.nonce}
                </div>
                <div className="pt-3">
                  <RotateSeedButton />
                </div>
              </div>
            ) : (
              <p className="text-white/60 text-sm">
                No seed yet. Rip a pack and one will be generated automatically.
              </p>
            )}
          </section>

          {pastSeeds.length > 0 && (
            <section className="mt-10 glass rounded-2xl p-6">
              <h2 className="font-display text-2xl font-bold mb-3">Revealed past seeds</h2>
              <div className="space-y-3 text-xs font-mono">
                {pastSeeds.map((s) => (
                  <div key={s.id} className="p-3 bg-bg-soft rounded-xl">
                    <div><span className="text-white/40">hash:</span> {s.seed_hash}</div>
                    <div><span className="text-white/40">plain:</span> {s.seed_plain ?? "(hidden)"}</div>
                    <div><span className="text-white/40">nonces used:</span> {s.nonce}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold mb-3">Verify any roll</h2>
        <FairnessVerifier />
      </section>
    </div>
  );
}
