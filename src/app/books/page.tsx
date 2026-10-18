"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { createBookLocal, pullBooks } from "@/lib/sync";
import { createClient } from "@/lib/supabase/client";
import BookOptionsDialog from "@/components/BookOptionsDialog";
import MembersDialog from "@/components/MembersDialog";

export default function BooksPage() {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showNewBook, setShowNewBook] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [optionsBookId, setOptionsBookId] = useState<string | null>(null);

  const books = useLiveQuery(
    () => db?.books.orderBy("updatedAt").reverse().toArray() ?? [],
    []
  );
  const [initialSyncDone, setInitialSyncDone] = useState(false);

  // Looked up from the live list (not copied), so if the book disappears
  // while the card is open — say, the owner deleted it elsewhere — the card
  // closes by itself.
  const optionsBook = books?.find((b) => b.id === optionsBookId);
  const closeOptions = useCallback(() => setOptionsBookId(null), []);

  const [membersBookId, setMembersBookId] = useState<string | null>(null);
  const membersBook = books?.find((b) => b.id === membersBookId);
  const closeMembers = useCallback(() => setMembersBookId(null), []);

  useEffect(() => {
    // One request, shared with the app's own start-up sync. Its answer also
    // tells us if the login has expired, so no separate check is needed.
    pullBooks()
      .then((result) => {
        if (result === "unauthorized") router.push("/login");
      })
      .finally(() => setInitialSyncDone(true));

    // Only for showing your email: read the saved session from this device
    // instead of asking the login server over the network.
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
  }, [router]);

  // While the popup is open: Escape closes it, and the page behind
  // doesn't scroll underneath it.
  useEffect(() => {
    if (!showNewBook) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNewBook();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [showNewBook]);

  function closeNewBook() {
    setShowNewBook(false);
    setNewName("");
  }

  async function createBook(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    await createBookLocal(name);
    setCreating(false);
    closeNewBook();
  }

  async function logout() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // Show what's already on this phone straight away. "Loading…" is only for
  // the very first visit, when there's nothing stored yet to show.
  const loading = books === undefined || (books.length === 0 && !initialSyncDone);
  const updating = !initialSyncDone && !!books && books.length > 0;

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="px-6 pt-6 pb-6">
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
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-1">
              Your books{updating ? " · updating…" : ""}
            </p>
            <h1 className="font-display text-3xl text-ink">My Books</h1>
          </div>
          <button
            onClick={() => setShowNewBook(true)}
            className="bg-ledger text-paper px-4 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition flex-shrink-0"
          >
            + New book
          </button>
        </div>
      </header>

      <div className="flex-1 px-6">
        {loading ? (
          <p className="font-mono text-sm text-muted">Loading books…</p>
        ) : books.length === 0 ? (
          <div className="border border-dashed border-line rounded-xl p-8 text-center">
            <p className="text-ink font-medium mb-1">No books yet</p>
            <p className="text-muted text-sm mb-4">Create your first book to start tracking.</p>
            <button
              onClick={() => setShowNewBook(true)}
              className="bg-ledger text-paper px-4 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition"
            >
              + New book
            </button>
          </div>
        ) : (
          <ul>
            {books.map((book) => (
              <li key={book.id} className="ledger-row py-4">
                <div className="flex justify-between items-center">
                  <Link href={`/books/${book.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink truncate">{book.name}</p>
                      <SyncDot status={book.syncStatus} />
                    </div>
                    <p className="font-mono text-xs text-muted mt-1">
                      {book.memberCount} member{book.memberCount !== 1 ? "s" : ""} · {book.transactionCount}{" "}
                      {book.transactionCount === 1 ? "entry" : "entries"}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3 flex-shrink-0 pl-3">
                    <button
                      onClick={() => setMembersBookId(book.id)}
                      aria-label={`Members of ${book.name}`}
                      className="text-xs text-ledger font-medium border border-ledger/30 rounded-md px-2 py-1 hover:bg-ledger-light transition"
                    >
                      Members
                    </button>
                    {book.myRole === "OWNER" && (
                      <button
                        onClick={() => setOptionsBookId(book.id)}
                        aria-label={`Options for ${book.name}`}
                        className="w-8 h-8 flex items-center justify-center text-muted border border-line rounded-md hover:text-ink transition"
                      >
                        ⋯
                      </button>
                    )}
                    {book.myRole !== "OWNER" && <span className="w-8 h-8" aria-hidden="true" />}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {optionsBook && <BookOptionsDialog book={optionsBook} onClose={closeOptions} />}

      {membersBook && <MembersDialog book={membersBook} onClose={closeMembers} />}

      {showNewBook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 pb-[12dvh]"
          onClick={closeNewBook}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-book-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white border border-line rounded-2xl p-6 shadow-2xl"
          >
            <h2 id="new-book-title" className="font-display text-2xl text-ink mb-1">
              New book
            </h2>
            <p className="text-sm text-muted mb-5">
              Give it a name — a trip, a household, a project.
            </p>

            <form onSubmit={createBook}>
              <label htmlFor="book-name" className="text-sm text-muted block mb-1">
                Book name
              </label>
              <input
                id="book-name"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Trip to Goa"
                maxLength={60}
                className="w-full border border-line bg-paper rounded-lg px-3 py-2.5 text-base text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
              />

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={closeNewBook}
                  className="flex-1 border border-line bg-white text-ink px-4 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex-1 bg-ledger text-paper px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 active:scale-95 transition"
                >
                  {creating ? "Creating…" : "Create book"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function SyncDot({ status }: { status: "synced" | "pending" | "error" }) {
  const color =
    status === "synced" ? "bg-ledger" : status === "pending" ? "bg-amber-500" : "bg-rust";
  const title =
    status === "synced" ? "Synced" : status === "pending" ? "Waiting to sync" : "Sync failed";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} title={title} />;
}
