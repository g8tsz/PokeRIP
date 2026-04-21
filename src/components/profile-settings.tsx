"use client";

import { useState } from "react";

export function ProfileSettings({
  initialDisplayName,
  initialHandle,
  initialPublic,
}: {
  initialDisplayName: string;
  initialHandle: string;
  initialPublic: boolean;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [handle, setHandle] = useState(initialHandle);
  const [publicProfile, setPublicProfile] = useState(initialPublic);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: displayName || null,
          handle: handle ? handle.toLowerCase().replace(/[^a-z0-9_]/g, "") : null,
          public_profile: publicProfile,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save_failed");
      setMsg({ kind: "ok", text: "Saved." });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-6 grid gap-4 sm:grid-cols-2">
      <div>
        <label className="text-xs uppercase tracking-widest text-white/40">
          Display name
        </label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="ShinyHunter"
          className="mt-1 w-full bg-bg-soft border border-white/10 rounded-xl px-4 py-2 text-sm"
          maxLength={40}
        />
      </div>

      <div>
        <label className="text-xs uppercase tracking-widest text-white/40">
          Public handle (a-z, 0-9, _)
        </label>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-white/40">/u/</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="shinyhunter"
            className="flex-1 bg-bg-soft border border-white/10 rounded-xl px-4 py-2 text-sm font-mono"
            maxLength={20}
          />
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer sm:col-span-2 mt-2">
        <input
          type="checkbox"
          checked={publicProfile}
          onChange={(e) => setPublicProfile(e.target.checked)}
          className="w-4 h-4"
        />
        <span className="text-sm">
          Make my profile public at{" "}
          <span className="text-brand font-mono">
            /u/{handle || "your-handle"}
          </span>{" "}
          so I can flex my pulls.
        </span>
      </label>

      <div className="sm:col-span-2 flex items-center justify-between">
        {msg ? (
          <div className={`text-sm ${msg.kind === "ok" ? "text-accent-cyan" : "text-accent-pink"}`}>
            {msg.text}
          </div>
        ) : (
          <div />
        )}
        <button onClick={save} disabled={busy} className="btn-primary">
          {busy ? "…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}
