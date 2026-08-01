"use client";

import { useEffect, useState } from "react";

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
    <main className="p-4 flex flex-col gap-4">
      <h1 className="text-xl font-bold">My Books</h1>

      <form onSubmit={createBook} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Trip to Goa"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={creating}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {creating ? "Adding..." : "Add"}
        </button>
      </form>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading books...</p>
      ) : books.length === 0 ? (
        <p className="text-slate-400 text-sm">
          No books yet. Create your first one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {books.map((book) => (
            <li
              key={book.id}
              className="border border-slate-200 rounded-xl p-4 flex justify-between items-center"
            >
              <div>
                <p className="font-medium">{book.name}</p>
                <p className="text-xs text-slate-400">
                  {book._count.transactions} transactions ·{" "}
                  {book._count.members} member(s)
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
