"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { createBookLocal, pullBooks } from "@/lib/sync";
import { createClient } from "@/lib/supabase/client";
import BookOptionsDialog from "@/components/BookOptionsDialog";

export default function BooksPage() {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showNewBook, setShowNewBook] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);
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

  useEffect(() => {
    // Confirms there's actually a session — if not, the API will 401 and
    // we bounce to /login. Local data still renders in the meantime.
    fetch("/api/books").then((res) => {
      if (res.status === 401) router.push("/login");
    });
    // Wait for this to settle (success OR failure, e.g. offline) before
    // trusting an empty local result — otherwise "no books yet" flashes
    // for a moment on every load, right before the real data arrives.
    pullBooks().finally(() => setInitialSyncDone(true));

    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
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
    if (navigator.clipboard) navigator.clipboard.writeText(link).catch(() => {});
  }

  async function logout() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const loading = books === undefined || !initialSyncDone;

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
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-1">Your books</p>
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
                      onClick={() => shareInvite(book.id)}
                      disabled={invitingId === book.id}
                      className="text-xs text-ledger font-medium border border-ledger/30 rounded-md px-2 py-1 hover:bg-ledger-light transition disabled:opacity-50"
                    >
                      {invitingId === book.id ? "…" : "Invite"}
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

      {optionsBook && <BookOptionsDialog book={optionsBook} onClose={closeOptions} />}

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
