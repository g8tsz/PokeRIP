import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FairnessOpeningPage({
  params,
}: {
  params: Promise<{ openingId: string }>;
}) {
  const { openingId } = await params;
  const user = await getSessionUser();

  const admin = createSupabaseAdmin();
  const { data: opening } = await admin
    .from("openings")
    .select(
      "id, user_id, server_seed_id, server_seed_hash, client_seed, nonce, roll_hash, roll_value, created_at, card:cards(name, rarity, image_url)",
    )
    .eq("id", openingId)
    .maybeSingle();

  if (!opening) notFound();
  if (!user || user.id !== opening.user_id) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-white/60">
        This roll belongs to another user.
      </div>
    );
  }

  const { data: seed } = await admin
    .from("server_seeds")
    .select("seed_plain, active, revealed_at")
    .eq("id", opening.server_seed_id)
    .single();

  const revealed = !seed?.active && !!seed?.seed_plain;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/fairness" className="text-sm text-white/50 hover:text-white">
        ← Provably fair
      </Link>
      <h1 className="font-display text-4xl font-bold mt-4">Roll #{opening.id.slice(0, 8)}</h1>
      <p className="text-white/50 mt-1 text-sm">
        {new Date(opening.created_at).toLocaleString()}
      </p>

      <div className="mt-8 glass-strong rounded-2xl p-6 font-mono text-sm break-all space-y-2">
        <div>
          <span className="text-white/40">server_seed_hash:</span> {opening.server_seed_hash}
        </div>
        <div>
          <span className="text-white/40">client_seed:</span> {opening.client_seed}
        </div>
        <div>
          <span className="text-white/40">nonce:</span> {opening.nonce}
        </div>
        <div>
          <span className="text-white/40">roll_hash:</span> {opening.roll_hash}
        </div>
        <div>
          <span className="text-white/40">roll_value:</span> {Number(opening.roll_value).toFixed(18)}
        </div>
        <div>
          <span className="text-white/40">server_seed (plain):</span>{" "}
          {revealed ? seed.seed_plain : "(not revealed yet — rotate your seed to unlock)"}
        </div>
      </div>

      <p className="mt-6 text-sm text-white/60">
        Plug these into the{" "}
        <Link href="/fairness" className="underline">
          verifier
        </Link>{" "}
        once the server seed is revealed (after you rotate).
      </p>
    </div>
  );
}
