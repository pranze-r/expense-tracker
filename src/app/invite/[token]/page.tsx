"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type InviteInfo = { bookName: string; role: string };

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);

      const res = await fetch(`/api/invites/${token}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "This invite link isn't valid.");
        return;
      }
      setInvite(await res.json());
    }
    load();
  }, [token]);

  async function joinBook() {
    setJoining(true);
    const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
    setJoining(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't join this book.");
      return;
    }
    router.push("/books");
  }

  return (
    <main className="min-h-screen flex flex-col justify-center px-8 text-center">
      {error ? (
        <>
          <h1 className="font-display text-2xl text-ink mb-3">Invite unavailable</h1>
          <p className="text-muted text-sm">{error}</p>
          <Link href="/books" className="text-ledger font-medium mt-6">
            Go to my books
          </Link>
        </>
      ) : !invite || isLoggedIn === null ? (
        <p className="font-mono text-sm text-muted">Loading invite…</p>
      ) : (
        <>
          <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-2">
            You're invited
          </p>
          <h1 className="font-display text-3xl text-ink mb-3">
            Join &ldquo;{invite.bookName}&rdquo;
          </h1>
          <p className="text-muted text-sm mb-8">
            You'll be added as {invite.role === "VIEWER" ? "a viewer" : "an editor"}.
          </p>

          {isLoggedIn ? (
            <button
              onClick={joinBook}
              disabled={joining}
              className="bg-ledger text-paper px-6 py-3 rounded-xl font-medium disabled:opacity-50 active:scale-[0.98] transition"
            >
              {joining ? "Joining…" : "Join this book"}
            </button>
          ) : (
            <Link
              href={`/login?next=/invite/${token}`}
              className="bg-ledger text-paper px-6 py-3 rounded-xl font-medium active:scale-[0.98] transition"
            >
              Log in to join
            </Link>
          )}
        </>
      )}
    </main>
  );
}
