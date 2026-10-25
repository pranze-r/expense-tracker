"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // undefined = checking, false = no valid reset session
  const [hasSession, setHasSession] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setHasSession(!!data.session));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/books");
    router.refresh();
  }

  if (hasSession === false) {
    return (
      <main className="min-h-screen flex flex-col justify-center px-8 text-center">
        <h1 className="font-display text-2xl text-ink mb-3">Link expired</h1>
        <p className="text-muted text-sm">
          This reset link is invalid or has already been used.
        </p>
        <Link href="/forgot-password" className="text-ledger font-medium mt-6">
          Request a new link
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col justify-center px-8">
      <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-2">
        Almost there
      </p>
      <h1 className="font-display text-3xl text-ink mb-8">Choose a new password</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="text-sm text-muted block mb-1">New password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-line bg-white rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
          />
        </div>
        <div>
          <label className="text-sm text-muted block mb-1">Confirm password</label>
          <input
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border border-line bg-white rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
          />
        </div>

        {error && <p className="text-sm text-rust">{error}</p>}

        <button
          type="submit"
          disabled={loading || hasSession === undefined}
          className="bg-ledger text-paper px-4 py-3 rounded-lg text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition mt-2"
        >
          {loading ? "Saving…" : "Update password"}
        </button>
      </form>
    </main>
  );
}
