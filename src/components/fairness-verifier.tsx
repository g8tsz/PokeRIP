"use client";

import { useMemo, useState } from "react";

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(key: string, message: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function FairnessVerifier() {
  const [serverSeed, setServerSeed] = useState("");
  const [serverSeedHash, setServerSeedHash] = useState("");
  const [clientSeed, setClientSeed] = useState("");
  const [nonce, setNonce] = useState<number>(0);
  const [expectedRollHash, setExpectedRollHash] = useState("");

  const [result, setResult] = useState<null | {
    seedHashOk: boolean;
    rollHashOk: boolean;
    computedHash: string;
    computedValue: number;
    computedSeedHash: string;
  }>(null);

  const disabled = useMemo(
    () => !serverSeed || !serverSeedHash || !clientSeed || nonce < 0,
    [serverSeed, serverSeedHash, clientSeed, nonce],
  );

  async function verify() {
    const computedSeedHash = await sha256Hex(serverSeed);
    const computedHash = await hmacSha256Hex(serverSeed, `${clientSeed}:${nonce}`);
    const first16 = computedHash.slice(0, 16);
    const big = BigInt("0x" + first16);
    const computedValue = Number(big) / Number(1n << 64n);

    setResult({
      seedHashOk: computedSeedHash.toLowerCase() === serverSeedHash.toLowerCase(),
      rollHashOk: expectedRollHash
        ? computedHash.toLowerCase() === expectedRollHash.toLowerCase()
        : true,
      computedHash,
      computedValue,
      computedSeedHash,
    });
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <p className="text-sm text-white/60">
        Paste values from an opening&apos;s fairness data or your revealed seeds.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="server_seed (revealed)" value={serverSeed} onChange={setServerSeed} mono />
        <Field label="server_seed_hash" value={serverSeedHash} onChange={setServerSeedHash} mono />
        <Field label="client_seed" value={clientSeed} onChange={setClientSeed} mono />
        <Field
          label="nonce"
          value={String(nonce)}
          onChange={(v) => setNonce(Number(v) || 0)}
          mono
          type="number"
        />
        <Field
          label="roll_hash (optional to match)"
          value={expectedRollHash}
          onChange={setExpectedRollHash}
          mono
        />
      </div>

      <button onClick={verify} disabled={disabled} className="btn-primary">
        Verify
      </button>

      {result && (
        <div className="mt-4 p-4 rounded-xl bg-bg-soft text-sm space-y-1 font-mono">
          <div>
            sha256(server_seed): {result.computedSeedHash}{" "}
            <span className={result.seedHashOk ? "text-accent-cyan" : "text-accent-pink"}>
              {result.seedHashOk ? "✓ matches hash" : "✗ MISMATCH"}
            </span>
          </div>
          <div>
            hmac(server, client:nonce): {result.computedHash}{" "}
            <span className={result.rollHashOk ? "text-accent-cyan" : "text-accent-pink"}>
              {result.rollHashOk ? "✓" : "✗"}
            </span>
          </div>
          <div>roll value: {result.computedValue.toFixed(18)}</div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  mono,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-white/40">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full bg-bg-soft border border-white/10 rounded-xl px-4 py-2 text-sm ${
          mono ? "font-mono" : ""
        }`}
      />
    </div>
  );
}
