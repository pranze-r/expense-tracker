"use client";

import { useEffect, useState } from "react";
import type { LocalBook } from "@/lib/db";
import { renameBookLocal, deleteBookLocal } from "@/lib/sync";

type Props = {
  book: LocalBook;
  onClose: () => void;
  // Called after the book is deleted — e.g. to leave the book's own page
  onDeleted?: () => void;
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function BookOptionsDialog({ book, onClose, onDeleted }: Props) {
  const [name, setName] = useState(book.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Escape closes the card, and the page behind doesn't scroll under it
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed !== book.name && !busy;
  const others = book.memberCount - 1;

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    await renameBookLocal(book.id, trimmed);
    setBusy(false);
    onClose();
  }

  async function remove() {
    setBusy(true);
    await deleteBookLocal(book.id);
    onDeleted?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 pb-[12dvh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-options-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white border border-line rounded-2xl p-6 shadow-2xl"
      >
        {confirmingDelete ? (
          <>
            <h2 id="book-options-title" className="font-display text-2xl text-ink mb-2">
              Delete &ldquo;{book.name}&rdquo;?
            </h2>
            <p className="text-sm text-muted mb-1">
              This permanently deletes the book and its{" "}
              {plural(book.transactionCount, "entry", "entries")}.
            </p>
            {others > 0 && (
              <p className="text-sm text-muted mb-1">
                {plural(others, "other member", "other members")} will lose access.
              </p>
            )}
            <p className="text-sm text-rust font-medium mb-5">This can&rsquo;t be undone.</p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
                className="flex-1 border border-line bg-white text-ink px-4 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="flex-1 bg-rust text-paper px-4 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="book-options-title" className="font-display text-2xl text-ink mb-5">
              Book options
            </h2>

            <form onSubmit={rename}>
              <label htmlFor="rename-book" className="text-sm text-muted block mb-1">
                Book name
              </label>
              <input
                id="rename-book"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="w-full border border-line bg-paper rounded-lg px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
              />
              <button
                type="submit"
                disabled={!canSave}
                className="w-full mt-3 bg-ledger text-paper px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 active:scale-95 transition"
              >
                Save name
              </button>
            </form>

            <div className="border-t border-line mt-6 pt-5">
              <p className="text-sm font-medium text-ink mb-1">Delete this book</p>
              <p className="text-sm text-muted mb-3">
                Removes the book and all its entries for everyone who has access.
              </p>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="w-full border border-rust/40 text-rust px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-rust/10 active:scale-95 transition"
              >
                Delete book…
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full mt-4 text-sm text-muted hover:text-ink transition py-1"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
