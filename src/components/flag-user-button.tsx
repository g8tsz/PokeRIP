"use client";

import { useState } from "react";

export function FlagUserButton({ userId, blocked }: { userId: string; blocked: boolean }) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const action = blocked ? "unblock" : "block";
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/user-flag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, blocked: !blocked }),
      });
      if (!res.ok) throw new Error("Failed");
      location.reload();
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <button onClick={toggle} disabled={busy} className={blocked ? "btn-ghost" : "btn-danger"}>
      {busy ? "…" : blocked ? "Unblock user" : "Block user"}
    </button>
  );
}
