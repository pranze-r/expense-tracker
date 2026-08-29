"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <main className="min-h-screen flex flex-col justify-center px-8 text-center">
        <h1 className="font-display text-2xl text-ink mb-3">Check your inbox</h1>
        <p className="text-muted text-sm">
          We sent a confirmation link to <strong>{email}</strong>. Tap it to
          finish setting up your account, then come back and log in.
        </p>
        <Link href="/login" className="text-ledger font-medium mt-6">
          Go to login
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col justify-center px-8">
      <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-2">
        Get started
      </p>
      <h1 className="font-display text-3xl text-ink mb-8">Create account</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="text-sm text-muted block mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-line bg-white rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
          />
        </div>
        <div>
          <label className="text-sm text-muted block mb-1">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-line bg-white rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
          />
          <p className="text-xs text-muted mt-1">At least 6 characters</p>
        </div>

        {error && <p className="text-sm text-rust">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="bg-ledger text-paper px-4 py-3 rounded-lg text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition mt-2"
        >
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>

      <p className="text-sm text-muted mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-ledger font-medium">
          Log in
        </Link>
      </p>
    </main>
  );
}
