"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ mode }: { mode: "signin" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "err" | "info"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setMessage({
          kind: "info",
          text: "Check your email to confirm your account, then sign in.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await fetch("/api/auth/bootstrap", { method: "POST" });
        location.href = "/dashboard";
      }
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <div className="glass rounded-2xl p-6">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-widest text-white/40">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full bg-bg-soft border border-white/10 rounded-xl px-4 py-2"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-white/40">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full bg-bg-soft border border-white/10 rounded-xl px-4 py-2"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="relative my-6 text-center text-white/30 text-xs uppercase tracking-widest">
        <span className="bg-bg-card px-3 relative">or</span>
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/10 -z-0" />
      </div>

      <button onClick={google} className="btn-ghost w-full">
        Continue with Google
      </button>

      {message && (
        <div
          className={`mt-4 text-sm ${message.kind === "err" ? "text-accent-pink" : "text-accent-cyan"}`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-6 text-center text-sm text-white/50">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <a href="/login" className="underline">
              Sign in
            </a>
          </>
        ) : (
          <>
            New here?{" "}
            <a href="/signup" className="underline">
              Create an account
            </a>
          </>
        )}
      </div>
    </div>
  );
}
