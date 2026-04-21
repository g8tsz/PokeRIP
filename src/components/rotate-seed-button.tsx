"use client";

import { useState } from "react";

export function RotateSeedButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function rotate() {
    if (!confirm("Rotate seed? Your current server seed will be revealed so you can verify past rolls.")) return;
    setBusy(true);
    const res = await fetch("/api/fairness/rotate", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      location.reload();
    } else {
      const data = await res.json();
      setMsg(data.error ?? "rotate_failed");
    }
  }

  return (
    <div>
      <button className="btn-ghost" onClick={rotate} disabled={busy}>
        {busy ? "…" : "Rotate seed (reveal current)"}
      </button>
      {msg && <div className="text-xs text-accent-pink mt-2">{msg}</div>}
    </div>
  );
}
