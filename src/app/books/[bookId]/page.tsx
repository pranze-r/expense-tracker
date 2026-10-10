"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { createTransactionLocal, editTransactionLocal, deleteTransactionLocal, pullTransactions } from "@/lib/sync";

export default function BookDetailPage() {
  const { bookId } = useParams<{ bookId: string }>();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  const book = useLiveQuery(() => db?.books.get(bookId), [bookId]);
  const transactions = useLiveQuery(
    () =>
      db?.transactions
        .where("bookId")
        .equals(bookId)
        .reverse()
        .sortBy("date") ?? [],
    [bookId]
  );
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");

  useEffect(() => {
    pullTransactions(bookId).finally(() => setInitialSyncDone(true));
  }, [bookId]);

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return;

    setAdding(true);
    await createTransactionLocal(bookId, {
      amount: parsed,
      note: note.trim() || null,
      date: new Date().toISOString(),
      categoryId: null,
    });
    setAmount("");
    setNote("");
    setAdding(false);
  }

  function startEditing(t: { id: string; amount: number; note: string | null }) {
    setEditingId(t.id);
    setEditAmount(String(t.amount));
    setEditNote(t.note ?? "");
  }

  async function saveEdit(id: string) {
    const parsed = parseFloat(editAmount);
    if (isNaN(parsed) || parsed <= 0) return;
    await editTransactionLocal(bookId, id, { amount: parsed, note: editNote.trim() || null });
    setEditingId(null);
  }

  async function removeTransaction(id: string) {
    setEditingId(null);
    await deleteTransactionLocal(bookId, id);
  }

  const loading = transactions === undefined || !initialSyncDone;
  const total = (transactions ?? []).reduce((sum, t) => sum + t.amount, 0);

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="px-6 pt-6 pb-4">
        <Link href="/books" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition mb-4">
          <span className="font-mono">←</span> All books
        </Link>
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-1">
          {book ? "Book" : "Loading…"}
        </p>
        <h1 className="font-display text-3xl text-ink mb-2">{book?.name ?? "…"}</h1>
        <p className="font-mono text-sm text-muted">
          Total: <span className="text-ink">₹{total.toFixed(2)}</span>
        </p>
      </header>

      <form onSubmit={addTransaction} className="px-6 pb-6 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="w-28 border border-line bg-white rounded-lg px-3 py-2.5 text-sm text-ink font-mono focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was it for?"
            className="flex-1 border border-line bg-white rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="bg-ledger text-paper px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 active:scale-95 transition"
        >
          {adding ? "Adding…" : "Add expense"}
        </button>
      </form>

      <div className="flex-1 px-6 pb-8">
        {loading ? (
          <p className="font-mono text-sm text-muted">Loading entries…</p>
        ) : transactions.length === 0 ? (
          <div className="border border-dashed border-line rounded-xl p-8 text-center">
            <p className="text-ink font-medium mb-1">No entries yet</p>
            <p className="text-muted text-sm">Add your first expense above.</p>
          </div>
        ) : (
          <ul>
            {transactions.map((t) =>
              editingId === t.id ? (
                <li key={t.id} className="ledger-row py-3">
                  <div className="flex gap-2 mb-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-24 border border-line bg-white rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
                    />
                    <input
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="What was it for?"
                      className="flex-1 border border-line bg-white rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(t.id)}
                      className="bg-ledger text-paper text-xs font-medium px-3 py-1.5 rounded-md active:scale-95 transition"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-muted px-3 py-1.5 rounded-md hover:text-ink transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => removeTransaction(t.id)}
                      className="text-xs text-rust px-3 py-1.5 rounded-md ml-auto hover:bg-rust/10 transition"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={t.id}
                  onClick={() => startEditing(t)}
                  className="ledger-row py-3 flex justify-between items-center cursor-pointer active:bg-ledger-light/40 transition"
                >
                  <div className="flex items-center gap-2">
                    <SyncDot status={t.syncStatus} />
                    <div>
                      <p className="text-ink text-sm">{t.note || "Untitled"}</p>
                      <p className="font-mono text-xs text-muted mt-0.5">
                        {new Date(t.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <p className="font-mono text-sm text-ink">₹{t.amount.toFixed(2)}</p>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </main>
  );
}

function SyncDot({ status }: { status: "synced" | "pending" | "error" }) {
  const color =
    status === "synced" ? "bg-ledger" : status === "pending" ? "bg-amber-500" : "bg-rust";
  const title =
    status === "synced" ? "Synced" : status === "pending" ? "Waiting to sync" : "Sync failed";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} title={title} />;
}