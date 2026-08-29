"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Book = {
  id: string;
  name: string;
  updatedAt: string;
  _count: { transactions: number; members: number };
};

export default function BooksPage() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);

  async function loadBooks() {
    setLoading(true);
    const res = await fetch("/api/books");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setBooks(data);
    setLoading(false);
  }

  useEffect(() => {
    loadBooks();
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function createBook(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName("");
    setCreating(false);
    loadBooks();
  }

  async function shareInvite(bookId: string) {
    setInvitingId(bookId);
    const res = await fetch(`/api/books/${bookId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "EDITOR" }),
    });
    setInvitingId(null);

    if (!res.ok) return;
    const invite = await res.json();
    const link = `${window.location.origin}/invite/${invite.token}`;
    setInviteLinks((prev) => ({ ...prev, [bookId]: link }));

    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).catch(() => {});
    }
  }

  async function logout() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition"
          >
            <span className="font-mono">←</span> Home
          </Link>
          {email && (
            <button
              onClick={logout}
              className="text-xs text-muted hover:text-rust transition font-mono"
            >
              {email} · Log out
            </button>
          )}
        </div>
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-1">
          Your books
        </p>
        <h1 className="font-display text-3xl text-ink">My Books</h1>
      </header>

      <form onSubmit={createBook} className="px-6 pb-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Trip to Goa"
          className="flex-1 border border-line bg-white rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
        />
        <button
          type="submit"
          disabled={creating}
          className="bg-ledger text-paper px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 active:scale-95 transition"
        >
          {creating ? "Adding…" : "Add"}
        </button>
      </form>

      <div className="flex-1 px-6">
        {loading ? (
          <p className="font-mono text-sm text-muted">Loading books…</p>
        ) : books.length === 0 ? (
          <div className="border border-dashed border-line rounded-xl p-8 text-center">
            <p className="text-ink font-medium mb-1">No books yet</p>
            <p className="text-muted text-sm">
              Add your first one above to start tracking.
            </p>
          </div>
        ) : (
          <ul>
            {books.map((book) => (
              <li key={book.id} className="ledger-row py-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-ink">{book.name}</p>
                    <p className="font-mono text-xs text-muted mt-1">
                      {book._count.members} member{book._count.members !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-mono text-sm text-muted">
                      {book._count.transactions} entries
                    </p>
                    <button
                      onClick={() => shareInvite(book.id)}
                      disabled={invitingId === book.id}
                      className="text-xs text-ledger font-medium border border-ledger/30 rounded-md px-2 py-1 hover:bg-ledger-light transition disabled:opacity-50"
                    >
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
