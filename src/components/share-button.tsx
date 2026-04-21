"use client";

import { useState } from "react";

export function ShareButton({
  handle,
  publicProfile,
}: {
  handle: string | null;
  publicProfile: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (!publicProfile || !handle) {
    return (
      <a href="#profile-settings" className="btn-ghost text-sm" title="Enable public profile below to share">
        Share →
      </a>
    );
  }

  async function copy() {
    const url = `${location.origin}/u/${handle}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fall back silently
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button onClick={copy} className="btn-ghost text-sm">
      {copied ? "Copied ✓" : `Share /u/${handle}`}
    </button>
  );
}
