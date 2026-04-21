"use client";

import { useState } from "react";

const QUICK = [10, 25, 50, 100, 250];

export function DepositForm() {
  const [amount, setAmount] = useState<number>(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount_cents: Math.round(amount * 100) }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Failed to start checkout");
      }
      location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => setAmount(q)}
            className={`chip ${amount === q ? "border-brand/60 bg-brand/10 text-brand" : ""}`}
          >
            ${q}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-white/50">$</span>
        <input
          type="number"
          min={1}
          max={5000}
          step={1}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="flex-1 bg-bg-soft border border-white/10 rounded-xl px-4 py-2"
        />
      </div>
      <button onClick={start} disabled={loading || amount < 1} className="btn-primary w-full">
        {loading ? "…" : `Deposit $${amount}`}
      </button>
      {error && <div className="text-xs text-accent-pink">{error}</div>}
    </div>
  );
}
