"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Book = {
  id: string;
  name: string;
  updatedAt: string;
  _count: { transactions: number; members: number };
};

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function loadBooks() {
    setLoading(true);
    const res = await fetch("/api/books");
    const data = await res.json();
    setBooks(data);
    setLoading(false);
  }

  useEffect(() => {
    loadBooks();
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

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 pt-6 pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition mb-4"
        >
          <span className="font-mono">←</span> Home
        </Link>
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
              <li key={book.id} className="ledger-row py-4 flex justify-between items-center">
                <div>
                  <p className="font-medium text-ink">{book.name}</p>
                  <p className="font-mono text-xs text-muted mt-1">
                    {book._count.members} member{book._count.members !== 1 ? "s" : ""}
                  </p>
                </div>
                <p className="font-mono text-sm text-muted">
                  {book._count.transactions} entries
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}