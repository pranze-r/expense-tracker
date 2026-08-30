"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { createBookLocal, pullBooks } from "@/lib/sync";
import { createClient } from "@/lib/supabase/client";

export default function BooksPage() {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const books = useLiveQuery(() => db?.books.orderBy("updatedAt").reverse().toArray() ?? [], []);

  useEffect(() => {
    fetch("/api/books").then((res) => {
      if (res.status === 401) router.push("/login");
    });
    pullBooks();
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [router]);

  async function createBook(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    await createBookLocal(newName.trim());
    setNewName("");
    setCreating(false);
  }

  async function shareInvite(bookId: string) {
    setInvitingId(bookId);
    const res = await fetch(`/api/books/${bookId}/invites`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "EDITOR" }),
    });
    setInvitingId(null);
    if (!res.ok) return;
    const invite = await res.json();
    const link = `${window.location.origin}/invite/${invite.token}`;
    setInviteLinks((prev) => ({ ...prev, [bookId]: link }));
    if (navigator.clipboard) navigator.clipboard.writeText(link).catch(() => {});
  }

  async function logout() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const loading = books === undefined;

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition">
            <span className="font-mono">←</span> Home
          </Link>
          {email && (
            <button onClick={logout} className="text-xs text-muted hover:text-rust transition font-mono">
              {email} · Log out
            </button>
          )}
        </div>
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-1">Your books</p>
        <h1 className="font-display text-3xl text-ink">My Books</h1>
      </header>

      <form onSubmit={createBook} className="px-6 pb-6 flex gap-2">
        <input
          value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Trip to Goa"
          className="flex-1 border border-line bg-white rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
        />
        <button type="submit" disabled={creating}
          className="bg-ledger text-paper px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 active:scale-95 transition">
          {creating ? "Adding…" : "Add"}
        </button>
      </form>

      <div className="flex-1 px-6">
        {loading ? (
          <p className="font-mono text-sm text-muted">Loading books…</p>
        ) : books.length === 0 ? (
          <div className="border border-dashed border-line rounded-xl p-8 text-center">
            <p className="text-ink font-medium mb-1">No books yet</p>
            <p className="text-muted text-sm">Add your first one above to start tracking.</p>
          </div>
        ) : (
          <ul>
            {books.map((book) => (
              <li key={book.id} className="ledger-row py-4">
                <div className="flex justify-between items-center">
                  <Link href={`/books/${book.id}`} className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink">{book.name}</p>
                      <SyncDot status={book.syncStatus} />
                    </div>
                    <p className="font-mono text-xs text-muted mt-1">
                      {book.memberCount} member{book.memberCount !== 1 ? "s" : ""}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3">
                    <p className="font-mono text-sm text-muted">{book.transactionCount} entries</p>
                    <button onClick={() => shareInvite(book.id)} disabled={invitingId === book.id}
                      className="text-xs text-ledger font-medium border border-ledger/30 rounded-md px-2 py-1 hover:bg-ledger-light transition disabled:opacity-50">
                      {invitingId === book.id ? "…" : "Invite"}
                    </button>
                  </div>
                </div>
                {inviteLinks[book.id] && (
                  <p className="font-mono text-xs text-ledger-dark bg-ledger-light rounded-md px-2 py-1.5 mt-2 break-all">
                    Copied: {inviteLinks[book.id]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function SyncDot({ status }: { status: "synced" | "pending" | "error" }) {
  const color = status === "synced" ? "bg-ledger" : status === "pending" ? "bg-amber-500" : "bg-rust";
  const title = status === "synced" ? "Synced" : status === "pending" ? "Waiting to sync" : "Sync failed";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} title={title} />;
}