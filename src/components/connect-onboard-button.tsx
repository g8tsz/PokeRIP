"use client";

import { useState } from "react";

export function ConnectOnboardButton({ onboarded }: { onboarded: boolean }) {
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    const res = await fetch("/api/connect/onboarding", { method: "POST" });
    const data = await res.json();
    if (data.url) location.href = data.url;
    else setLoading(false);
  }

  return (
    <button onClick={start} className="btn-primary" disabled={loading}>
      {loading ? "…" : onboarded ? "Update bank account" : "Connect bank account"}
    </button>
  );
}
