"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type TransactionType } from "@/lib/db";
import {
  addStarterCategories,
  createCategoryLocal,
  createTransactionLocal,
  editTransactionLocal,
  deleteTransactionLocal,
  pullBooks,
  pullCategories,
  pullTransactions,
} from "@/lib/sync";
import BookOptionsDialog from "@/components/BookOptionsDialog";
import MembersDialog from "@/components/MembersDialog";
import CategoryPicker from "@/components/CategoryPicker";
import CategoriesDialog from "@/components/CategoriesDialog";

// 1,23,456.50 — Indian digit grouping, always two decimals
function formatMoney(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BookDetailPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();
  const [showOptions, setShowOptions] = useState(false);
  const closeOptions = useCallback(() => setShowOptions(false), []);
  const [showMembers, setShowMembers] = useState(false);
  const closeMembers = useCallback(() => setShowMembers(false), []);
  const [showCategories, setShowCategories] = useState(false);
  const closeCategories = useCallback(() => setShowCategories(false), []);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<TransactionType>("DEBIT");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // undefined = still loading, null = this book isn't here (deleted, or no access)
  const book = useLiveQuery(async () => (await db?.books.get(bookId)) ?? null, [bookId]);
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
  const [editType, setEditType] = useState<TransactionType>("DEBIT");
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);

  const categories = useLiveQuery(
    async () =>
      ((await db?.categories.where("bookId").equals(bookId).toArray()) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [bookId]
  );
  const categoryList = categories ?? [];
  const categoryNames = new Map(categoryList.map((c) => [c.id, c.name]));
  // Viewers can see categories but not create or manage them
  const canEditCategories = book?.myRole !== "VIEWER";
  // Viewers can look at everything but not add or change entries
  const canEditEntries = book?.myRole !== "VIEWER";
  // A selected category may have been removed since it was picked
  const stillExists = (id: string | null) => (id && categoryNames.has(id) ? id : null);

  useEffect(() => {
    // Pull the book itself too, so opening a book directly on a fresh device
    // doesn't briefly look like the book is missing.
    Promise.all([pullBooks(), pullCategories(bookId), pullTransactions(bookId)]).finally(() =>
      setInitialSyncDone(true)
    );
  }, [bookId]);

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return;

    setAdding(true);
    await createTransactionLocal(bookId, {
      amount: parsed,
      type,
      note: note.trim() || null,
      date: new Date().toISOString(),
      categoryId: stillExists(categoryId),
    });
    setAmount("");
    setNote("");
    setCategoryId(null);
    setAdding(false);
    // `type` stays as chosen — logging several debits in a row is common
  }

  function startEditing(t: {
    id: string;
    amount: number;
    note: string | null;
    type: TransactionType;
    categoryId: string | null;
  }) {
    setEditingId(t.id);
    setEditCategoryId(t.categoryId ?? null);
    setEditAmount(String(t.amount));
    setEditNote(t.note ?? "");
    setEditType(t.type === "CREDIT" ? "CREDIT" : "DEBIT");
  }

  async function saveEdit(id: string) {
    const parsed = parseFloat(editAmount);
    if (isNaN(parsed) || parsed <= 0) return;
    await editTransactionLocal(bookId, id, {
      amount: parsed,
      type: editType,
      note: editNote.trim() || null,
      categoryId: stillExists(editCategoryId),
    });
    setEditingId(null);
  }

  async function removeTransaction(id: string) {
    setEditingId(null);
    await deleteTransactionLocal(bookId, id);
  }

  // Show the entries already stored on this phone straight away; "Loading…"
  // is only for the first visit, when there's nothing stored yet.
  const loading = transactions === undefined || (transactions.length === 0 && !initialSyncDone);
  const updating = !initialSyncDone && (transactions?.length ?? 0) > 0;

  const list = transactions ?? [];
  // Entries saved before debit/credit existed have no type — those were
  // all expenses, so anything that isn't an explicit CREDIT counts as out.
  const totalIn = list.filter((t) => t.type === "CREDIT").reduce((sum, t) => sum + t.amount, 0);
  const totalOut = list.filter((t) => t.type !== "CREDIT").reduce((sum, t) => sum + t.amount, 0);
  const balance = totalIn - totalOut;

  if (book === null && initialSyncDone) {
    return (
      <main className="min-h-dvh flex flex-col justify-center px-8 text-center">
        <h1 className="font-display text-2xl text-ink mb-2">This book isn&rsquo;t here anymore</h1>
        <p className="text-sm text-muted mb-6">
          It may have been deleted, or you no longer have access to it.
        </p>
        <Link href="/books" className="text-ledger font-medium">
          Back to my books
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <Link href="/books" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition">
            <span className="font-mono">←</span> All books
          </Link>
          <div className="flex items-center gap-2">
            {book && (
              <button
                onClick={() => setShowMembers(true)}
                className="h-8 px-3 text-sm text-muted border border-line rounded-md hover:text-ink transition"
              >
                Members
              </button>
            )}
            {book?.myRole === "OWNER" && (
              <button
                onClick={() => setShowOptions(true)}
                aria-label="Book options"
                className="w-8 h-8 flex items-center justify-center text-muted border border-line rounded-md hover:text-ink transition"
              >
                ⋯
              </button>
            )}
          </div>
        </div>
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-1">
          {book ? (updating ? "Book · updating…" : "Book") : "Loading…"}
        </p>
        <h1 className="font-display text-3xl text-ink mb-4">{book?.name ?? "…"}</h1>

        <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted mb-1">Balance</p>
        <p className={`font-mono text-3xl mb-3 ${balance < 0 ? "text-rust" : "text-ink"}`}>
          {balance < 0 ? "−" : ""}₹{formatMoney(Math.abs(balance))}
        </p>
        <div className="flex gap-6 font-mono text-sm">
          <p className="text-muted">
            In <span className="text-ledger">+₹{formatMoney(totalIn)}</span>
          </p>
          <p className="text-muted">
            Out <span className="text-rust">−₹{formatMoney(totalOut)}</span>
          </p>
        </div>
      </header>

      {canEditEntries ? (
        <form onSubmit={addTransaction} className="px-6 pb-6 flex flex-col gap-2">
          <TypeToggle value={type} onChange={setType} />
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="w-28 shrink-0 border border-line bg-white rounded-lg px-3 py-2.5 text-sm text-ink font-mono focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={type === "DEBIT" ? "What was it for?" : "Where did it come from?"}
              className="min-w-0 flex-1 border border-line bg-white rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
            />
          </div>
          <CategoryPicker
            categories={categoryList}
            value={stillExists(categoryId)}
            onChange={setCategoryId}
            onCreate={(name) => createCategoryLocal(bookId, name)}
            onAddStarter={() => addStarterCategories(bookId)}
            canEdit={canEditCategories}
            onManage={() => setShowCategories(true)}
          />
          <button
            type="submit"
            disabled={adding}
            className={`${
              type === "DEBIT" ? "bg-rust" : "bg-ledger"
            } text-paper px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 active:scale-95 transition`}
          >
            {adding ? "Adding…" : type === "DEBIT" ? "Add debit (money out)" : "Add credit (money in)"}
          </button>
        </form>
      ) : (
        <p className="mx-6 mb-6 rounded-lg bg-paper border border-line px-3 py-2.5 text-sm text-muted">
          You have view-only access to this book.
        </p>
      )}

      <div className="flex-1 px-6 pb-8">
        {loading ? (
          <p className="font-mono text-sm text-muted">Loading entries…</p>
        ) : transactions.length === 0 ? (
          <div className="border border-dashed border-line rounded-xl p-8 text-center">
            <p className="text-ink font-medium mb-1">No entries yet</p>
            <p className="text-muted text-sm">Add your first debit or credit above.</p>
          </div>
        ) : (
          <ul>
            {transactions.map((t) =>
              editingId === t.id ? (
                <li key={t.id} className="ledger-row py-3">
                  <div className="mb-2">
                    <TypeToggle value={editType} onChange={setEditType} compact />
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-24 shrink-0 border border-line bg-white rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
                    />
                    <input
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Note"
                      className="min-w-0 flex-1 border border-line bg-white rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger"
                    />
                  </div>
                  <div className="mb-3">
                    <CategoryPicker
                      compact
                      categories={categoryList}
                      value={stillExists(editCategoryId)}
                      onChange={setEditCategoryId}
                      onCreate={(name) => createCategoryLocal(bookId, name)}
                      onAddStarter={() => addStarterCategories(bookId)}
                      canEdit={canEditCategories}
                      onManage={() => setShowCategories(true)}
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
                  onClick={canEditEntries ? () => startEditing(t) : undefined}
                  className={`ledger-row py-3 flex justify-between items-center ${
                    canEditEntries ? "cursor-pointer active:bg-ledger-light/40 transition" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <SyncDot status={t.syncStatus} />
                    <div className="min-w-0">
                      <p className="text-ink text-sm break-words">{t.note || "Untitled"}</p>
                      <p className="font-mono text-xs text-muted mt-0.5">
                        {new Date(t.date).toLocaleDateString()}
                        {t.categoryId && categoryNames.get(t.categoryId) && (
                          <>
                            {" · "}
                            <span className="text-ink">{categoryNames.get(t.categoryId)}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`font-mono text-sm whitespace-nowrap flex-shrink-0 pl-3 ${
                      t.type === "CREDIT" ? "text-ledger" : "text-rust"
                    }`}
                  >
                    {t.type === "CREDIT" ? "+" : "−"}₹{formatMoney(t.amount)}
                  </p>
                </li>
              )
            )}
          </ul>
        )}
      </div>

      {showMembers && book && (
        <MembersDialog book={book} onClose={closeMembers} onLeft={() => router.push("/books")} />
      )}

      {showCategories && (
        <CategoriesDialog bookId={bookId} categories={categoryList} onClose={closeCategories} />
      )}

      {showOptions && book && (
        <BookOptionsDialog book={book} onClose={closeOptions} onDeleted={() => router.push("/books")} />
      )}
    </main>
  );
}

function TypeToggle({
  value,
  onChange,
  compact = false,
}: {
  value: TransactionType;
  onChange: (v: TransactionType) => void;
  compact?: boolean;
}) {
  // Two separate buttons with a gap between them (not segments packed
  // inside one tinted box), so they can never sit on top of each other.
  const option = (kind: TransactionType, sign: string, label: string, hint: string, activeClass: string) => {
    const active = value === kind;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onChange(kind)}
        className={`min-w-0 flex-1 rounded-lg border-2 text-center font-medium transition ${
          compact ? "px-2 py-1.5 text-xs" : "px-3 py-2.5 text-sm"
        } ${active ? activeClass : "border-line bg-white text-muted"}`}
      >
        <span className="block whitespace-nowrap">
          {sign} {label}
        </span>
        {!compact && <span className="block whitespace-nowrap text-xs font-normal">{hint}</span>}
      </button>
    );
  };

  return (
    <div role="group" aria-label="Entry type" className="flex gap-2">
      {option("DEBIT", "−", "Debit", "money out", "border-rust bg-rust text-paper")}
      {option("CREDIT", "+", "Credit", "money in", "border-ledger bg-ledger text-paper")}
    </div>
  );
}

function SyncDot({ status }: { status: "synced" | "pending" | "error" }) {
  const color =
    status === "synced" ? "bg-ledger" : status === "pending" ? "bg-amber-500" : "bg-rust";
  const title =
    status === "synced" ? "Synced" : status === "pending" ? "Waiting to sync" : "Sync failed";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} title={title} />;
}
