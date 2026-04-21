"use client";

import { useState } from "react";

export function PayoutReviewButtons({ payoutId }: { payoutId: string }) {
  const [busy, setBusy] = useState(false);

  async function cancel() {
    const reason = prompt("Reason for canceling this payout? (refunded to user wallet)");
    if (!reason) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/payout-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payout_id: payoutId, action: "cancel", reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "cancel_failed");
      location.reload();
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2 justify-end">
      <button onClick={cancel} disabled={busy} className="btn-danger text-xs py-1 px-2">
        {busy ? "…" : "Cancel + refund"}
      </button>
    </div>
  );
}
