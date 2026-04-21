/**
 * Provably-fair RNG for pack openings.
 *
 * Model (same pattern used by major case-opening sites):
 *   1. Server generates `server_seed` (32 random bytes) and publishes
 *      `server_seed_hash = sha256(server_seed)` BEFORE the user can roll.
 *   2. User provides (or we default) a `client_seed` — they can change it any time.
 *   3. Each roll uses a monotonically increasing `nonce`.
 *   4. roll = HMAC_SHA256(server_seed, `${client_seed}:${nonce}`).
 *   5. We take the first 8 bytes, turn them into a number in [0, 1).
 *   6. After the server seed is rotated out (or on explicit user request), we
 *      reveal `server_seed` so anyone can verify that
 *         sha256(server_seed) == server_seed_hash  AND
 *         HMAC_SHA256(server_seed, "$client_seed:$nonce") == roll_hash
 *      proving we committed to the seed before seeing the user's choices.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";

export type ServerSeed = {
  /** The raw server seed (hex). KEEP PRIVATE until rotated / revealed. */
  plain: string;
  /** sha256(plain). Safe to publish. */
  hash: string;
};

export function newServerSeed(): ServerSeed {
  const plain = randomBytes(32).toString("hex");
  const hash = sha256Hex(plain);
  return { plain, hash };
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function newClientSeed(): string {
  return randomBytes(12).toString("hex");
}

export type Roll = {
  /** HMAC-SHA256 hex of (serverSeed, `${clientSeed}:${nonce}`). */
  hash: string;
  /** Uniform float in [0, 1), derived from the first 8 bytes of the hmac. */
  value: number;
};

export function computeRoll(serverSeed: string, clientSeed: string, nonce: number): Roll {
  const hash = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}`).digest("hex");
  // Convert the first 8 bytes of the HMAC into a uniform float in [0, 1).
  //
  // A JS Number is a 64-bit double with a 53-bit mantissa. We take the top
  // 53 bits of the 64-bit hash value (by shifting off the low 11 bits) and
  // divide by 2^53 — both the numerator and denominator are exactly
  // representable, so there's no rounding bias. 2^53 cannot be reached
  // (max value is 2^53 - 1), guaranteeing the result is strictly < 1.0.
  const first16 = hash.slice(0, 16);
  const big = BigInt("0x" + first16);
  const top53 = big >> 11n;
  const value = Number(top53) / 2 ** 53;
  return { hash, value };
}

/**
 * Verify a revealed server seed produced the given roll — client-side safe.
 *
 * Pass `expectedRollValue` (when known) to check that the published numeric
 * value also matches what this library would compute. This guards against a
 * server that publishes a correct hash but tampered-with value.
 */
export function verifyRoll(
  serverSeedPlain: string,
  serverSeedHash: string,
  clientSeed: string,
  nonce: number,
  expectedRollHash: string,
  expectedRollValue?: number,
): boolean {
  if (sha256Hex(serverSeedPlain) !== serverSeedHash) return false;
  const { hash, value } = computeRoll(serverSeedPlain, clientSeed, nonce);
  if (hash !== expectedRollHash) return false;
  if (expectedRollValue !== undefined) {
    // Allow a tiny epsilon for platforms that serialized the float with
    // slightly different precision (e.g. JSON vs numeric round-trip).
    if (Math.abs(value - expectedRollValue) > 1e-12) return false;
  }
  return true;
}

/**
 * Pick a weighted reward from a loot table.
 * Rewards with weight <= 0 are ignored; a max_supply of 0 remaining also excludes them.
 */
export type WeightedReward<T> = {
  item: T;
  weight: number;
  /** Optional remaining supply; if 0 the reward is ineligible. */
  remaining?: number | null;
};

export function pickWeighted<T>(rewards: WeightedReward<T>[], roll: number): WeightedReward<T> {
  const eligible = rewards.filter(
    (r) => r.weight > 0 && (r.remaining === undefined || r.remaining === null || r.remaining > 0),
  );
  if (eligible.length === 0) {
    throw new Error("No eligible rewards in loot table");
  }
  const total = eligible.reduce((acc, r) => acc + r.weight, 0);
  const target = roll * total;
  let cumulative = 0;
  for (const r of eligible) {
    cumulative += r.weight;
    if (target < cumulative) return r;
  }
  // Floating point edge — return last.
  return eligible[eligible.length - 1]!;
}
