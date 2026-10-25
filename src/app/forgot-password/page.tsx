"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "link"
      ? "That reset link is invalid or has expired. Request a new one below."
      : null
  );
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center">
        <h1 className="font-display text-2xl text-ink mb-3">Check your inbox</h1>
        <p className="text-muted text-sm">
          If an account exists for <strong>{email}</strong>, we sent a link to reset your
          password. Open it on this same device and browser.
        </p>
        <Link href="/login" className="text-ledger font-medium mt-6 inline-block">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-2">
        Locked out?
      </p>
      <h1 className="font-display text-3xl text-ink mb-3">Reset password</h1>
      <p className="text-sm text-muted mb-8">
        Enter your email and we&rsquo;ll send you a link to choose a new password.
      </p>

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

        {error && <p className="text-sm text-rust">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="bg-ledger text-paper px-4 py-3 rounded-lg text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition mt-2"
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="text-sm text-muted mt-6">
        Remembered it?{" "}
        <Link href="/login" className="text-ledger font-medium">
          Log in
        </Link>
      </p>
    </>
  );
}

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex flex-col justify-center px-8">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <ForgotPasswordForm />
      </Suspense>
    </main>
  );
}
