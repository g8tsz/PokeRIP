"use client";

import { useState } from "react";
import { formatUSD } from "@/lib/utils";

export function PayoutForm({ balanceCents }: { balanceCents: number }) {
  const [amount, setAmount] = useState<number>(Math.min(25, balanceCents / 100));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  async function submit() {
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/wallet/payout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount_cents: Math.round(amount * 100) }),
      });
      const data = await res.json();
      if (!res.ok) {
        // If Stripe Connect onboarding is required, redirect the user.
        if (data.onboarding_url) {
          location.href = data.onboarding_url;
          return;
        }
        throw new Error(data.error ?? "Payout failed");
      }
      setMsg({ kind: "ok", text: "Payout queued — funds will arrive in 2-3 business days." });
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  const max = balanceCents / 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-white/50">$</span>
        <input
          type="number"
          min={1}
          max={max}
          step={1}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="flex-1 bg-bg-soft border border-white/10 rounded-xl px-4 py-2"
        />
      </div>
      <div className="text-xs text-white/40">Max {formatUSD(balanceCents)}</div>
      <button
        onClick={submit}
        disabled={loading || amount < 1 || amount > max}
        className="btn-ghost w-full"
      >
        {loading ? "…" : `Cash out $${Math.max(0, Math.floor(amount))}`}
      </button>
      {msg && (
        <div className={`text-xs ${msg.kind === "err" ? "text-accent-pink" : "text-accent-cyan"}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
