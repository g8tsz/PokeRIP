"use client";

import { useState } from "react";

export function WalletAdjustForm({ userId }: { userId: string }) {
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState<number>(10);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm(`${direction === "credit" ? "Credit" : "Debit"} $${amount} to this wallet?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const cents = Math.round(amount * 100);
      const signed = direction === "credit" ? cents : -cents;
      const res = await fetch("/api/admin/wallet-adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, amount_cents: signed, memo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "adjust_failed");
      setMsg({ kind: "ok", text: `Done. New balance: $${(data.balance_after_cents / 100).toFixed(2)}` });
      setMemo("");
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[auto_1fr_2fr_auto] items-end">
      <div>
        <label className="text-xs uppercase tracking-widest text-white/40">Direction</label>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "credit" | "debit")}
          className="mt-1 bg-bg-soft border border-white/10 rounded-xl px-3 py-2 text-sm"
        >
          <option value="credit">Credit (+)</option>
          <option value="debit">Debit (−)</option>
        </select>
      </div>
      <div>
        <label className="text-xs uppercase tracking-widest text-white/40">Amount ($)</label>
        <input
          type="number"
          min={0.01}
          step={0.01}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="mt-1 w-full bg-bg-soft border border-white/10 rounded-xl px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-widest text-white/40">Memo</label>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="Reason for adjustment"
          className="mt-1 w-full bg-bg-soft border border-white/10 rounded-xl px-3 py-2 text-sm"
          required
          maxLength={200}
        />
      </div>
      <button type="submit" disabled={busy} className={direction === "credit" ? "btn-primary" : "btn-danger"}>
        {busy ? "…" : direction === "credit" ? "Credit" : "Debit"}
      </button>
      {msg && (
        <div className={`sm:col-span-4 text-sm ${msg.kind === "ok" ? "text-accent-cyan" : "text-accent-pink"}`}>
          {msg.text}
        </div>
      )}
    </form>
  );
}
