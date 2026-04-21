"use client";

import { useState } from "react";

export function AgeGateForm({ next }: { next: string }) {
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    if (!dob) {
      setError("Enter your date of birth.");
      return;
    }
    const birth = new Date(dob);
    const now = new Date();
    const years = (now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years < 18) {
      setError("You must be 18 or older to use PokéRip.");
      return;
    }
    document.cookie = `age-verified=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    location.href = next;
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div>
        <label className="text-xs uppercase tracking-widest text-white/40">Date of birth</label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="mt-1 w-full bg-bg-soft border border-white/10 rounded-xl px-4 py-2"
        />
      </div>
      <button onClick={confirm} className="btn-primary w-full">
        I&apos;m 18+ — continue
      </button>
      {error && <div className="text-sm text-accent-pink">{error}</div>}
      <p className="text-xs text-white/40">
        By continuing, you confirm you&apos;re of legal age in your jurisdiction and agree to our{" "}
        <a href="/terms" className="underline">Terms</a> and{" "}
        <a href="/responsible-play" className="underline">Responsible Play</a> policy.
      </p>
    </div>
  );
}
