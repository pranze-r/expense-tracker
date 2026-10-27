"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LocalLoanPayment } from "@/lib/db";
import {
  createLoanPaymentLocal,
  deleteLoanPaymentLocal,
  editLoanPaymentLocal,
  pullLoans,
} from "@/lib/sync";
import { dayToIso, dueText, formatDate, formatMoney, round2, summarize, toDateInput } from "@/lib/loanUtils";
import LoanFormDialog from "@/components/LoanFormDialog";

const smallInput =
  "w-full border border-line bg-white rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger";

export default function LoanDetailPage() {
  const { loanId } = useParams<{ loanId: string }>();
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [initialSyncDone, setInitialSyncDone] = useState(false);

  // undefined = still reading from this device, null = no such loan
  const loan = useLiveQuery(async () => (db ? ((await db.loans.get(loanId)) ?? null) : null), [loanId]);
  const payments = useLiveQuery(
    () => db?.loanPayments.where("loanId").equals(loanId).toArray() ?? [],
    [loanId]
  );
  const allLoans = useLiveQuery(() => db?.loans.toArray() ?? [], []);

  // Add-repayment form
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Editing one repayment
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editOriginalDate, setEditOriginalDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    pullLoans()
      .then((result) => {
        if (result === "unauthorized") router.push("/login");
      })
      .finally(() => setInitialSyncDone(true));
  }, [router]);

  const closeEdit = useCallback(() => setShowEdit(false), []);

  const sortedPayments = useMemo(
    () => [...(payments ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [payments]
  );
  const people = useMemo(
    () => Array.from(new Set((allLoans ?? []).map((l) => l.person))).sort((a, b) => a.localeCompare(b)),
    [allLoans]
  );

  if (loan === undefined || payments === undefined) {
    return (
      <main className="min-h-dvh px-6 pt-6">
        <p className="font-mono text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (loan === null) {
    return (
      <main className="min-h-dvh px-6 pt-6">
        <Link href="/loans" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition mb-6">
          <span className="font-mono">←</span> Lend &amp; Borrow
        </Link>
        {initialSyncDone ? (
          <div className="border border-dashed border-line rounded-xl p-8 text-center">
            <p className="text-ink font-medium mb-1">Loan not found</p>
            <p className="text-muted text-sm">It may have been deleted on another device.</p>
          </div>
        ) : (
          <p className="font-mono text-sm text-muted">Loading…</p>
        )}
      </main>
    );
  }

  const lent = loan.direction === "LENT";
  const summary = summarize(loan, payments);
  const due = dueText(loan, summary);
  const accent = lent ? "text-ledger" : "text-rust";
  const repayVerb = lent ? "Received" : "Paid back";

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = round2(parseFloat(amount));
    if (!(value > 0)) return setError("Enter an amount greater than 0.");
    if (value > summary.remaining) {
      return setError(`That's more than the ₹${formatMoney(summary.remaining)} still left.`);
    }
    await createLoanPaymentLocal(loanId, {
      amount: value,
      note: note.trim() || null,
      date: dayToIso(date),
    });
    setAmount("");
    setNote("");
    setDate(toDateInput(new Date()));
  }

  async function settleInFull() {
    if (summary.remaining <= 0) return;
    await createLoanPaymentLocal(loanId, {
      amount: summary.remaining,
      note: "Settled in full",
      date: new Date().toISOString(),
    });
  }

  function startEditing(p: LocalLoanPayment) {
    const day = toDateInput(new Date(p.date));
    setEditingId(p.id);
    setEditAmount(String(p.amount));
    setEditDate(day);
    setEditOriginalDate(day);
    setEditNote(p.note ?? "");
    setEditError(null);
  }

  async function savePayment(p: LocalLoanPayment) {
    setEditError(null);
    const value = round2(parseFloat(editAmount));
    if (!(value > 0)) return setEditError("Enter an amount greater than 0.");
    if (value > round2(summary.remaining + p.amount)) {
      return setEditError("That's more than the loan amount.");
    }
    await editLoanPaymentLocal(loanId, p.id, {
      amount: value,
      note: editNote.trim() || null,
      ...(editDate && editDate !== editOriginalDate ? { date: dayToIso(editDate) } : {}),
    });
    setEditingId(null);
  }

  async function removePayment(p: LocalLoanPayment) {
    await deleteLoanPaymentLocal(loanId, p.id);
    setEditingId(null);
  }

  return (
    <main className="min-h-dvh flex flex-col pb-10">
      <header className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <Link href="/loans" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition">
            <span className="font-mono">←</span> Lend &amp; Borrow
          </Link>
          <button
            onClick={() => setShowEdit(true)}
            className="text-xs text-ledger font-medium border border-ledger/30 rounded-md px-2.5 py-1 hover:bg-ledger-light transition"
          >
            Edit
          </button>
        </div>
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-1">
          {lent ? "You lent to" : "You borrowed from"}
        </p>
        <h1 className="font-display text-3xl text-ink break-words">{loan.person}</h1>
        {loan.note && <p className="text-sm text-muted mt-1">{loan.note}</p>}
      </header>

      <section className="px-6 mb-5" aria-label="Loan summary">
        <div className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-muted">
                {summary.settled ? "Status" : lent ? "Still to get" : "Still to pay"}
              </p>
              <p className={`font-display text-3xl mt-1 ${summary.settled ? "text-muted" : accent}`}>
                {summary.settled ? "Settled" : `₹${formatMoney(summary.remaining)}`}
              </p>
            </div>
            <div className="text-right font-mono text-xs text-muted leading-relaxed">
              <p>Total ₹{formatMoney(loan.amount)}</p>
              <p>Paid ₹{formatMoney(summary.paid)}</p>
            </div>
          </div>

          <div
            className="mt-3 h-2 rounded-full bg-line overflow-hidden"
            role="progressbar"
            aria-label="Paid back"
            aria-valuenow={summary.percentPaid}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={`h-full ${lent ? "bg-ledger" : "bg-rust"}`} style={{ width: `${summary.percentPaid}%` }} />
          </div>

          <div className="flex justify-between mt-3 font-mono text-xs text-muted">
            <span>Given {formatDate(loan.date)}</span>
            {due && <span className={summary.overdue ? "text-rust font-medium" : ""}>{due}</span>}
          </div>
        </div>

        {loan.syncStatus === "error" && (
          <p role="alert" className="text-sm text-rust mt-2">
            This loan couldn&rsquo;t be saved to the server{loan.syncError ? `: ${loan.syncError}` : "."}
          </p>
        )}
      </section>

      {!summary.settled && (
        <section className="px-6 mb-6" aria-label="Record a repayment">
          <h2 className="font-mono text-xs tracking-[0.15em] uppercase text-ink mb-2">
            {lent ? "Money received back" : "Money paid back"}
          </h2>
          <form onSubmit={addPayment} className="rounded-xl border border-line bg-white p-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                aria-label="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`₹ up to ${formatMoney(summary.remaining)}`}
                className={`${smallInput} flex-1 min-w-0`}
              />
              <input
                type="date"
                required
                aria-label="Date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${smallInput} flex-1 min-w-0`}
              />
            </div>
            <input
              aria-label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={200}
              className={smallInput}
            />
            {error && (
              <p role="alert" className="text-sm text-rust">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={settleInFull}
                className="flex-1 border border-ledger/40 text-ledger bg-white px-3 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition"
              >
                Mark fully paid
              </button>
              <button
                type="submit"
                className="flex-1 bg-ledger text-paper px-3 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition"
              >
                Add {lent ? "received" : "payment"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="px-6" aria-label="Repayment history">
        <h2 className="font-mono text-xs tracking-[0.15em] uppercase text-ink mb-2">
          History{sortedPayments.length > 0 ? ` · ${sortedPayments.length}` : ""}
        </h2>

        {sortedPayments.length === 0 ? (
          <div className="border border-dashed border-line rounded-xl p-6 text-center">
            <p className="text-muted text-sm">No repayments recorded yet.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sortedPayments.map((p) =>
              editingId === p.id ? (
                <li key={p.id} className="bg-white border border-ledger/40 rounded-lg p-3 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      aria-label="Amount"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className={`${smallInput} flex-1 min-w-0`}
                    />
                    <input
                      type="date"
                      aria-label="Date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className={`${smallInput} flex-1 min-w-0`}
                    />
                  </div>
                  <input
                    aria-label="Note"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Note (optional)"
                    maxLength={200}
                    className={smallInput}
                  />
                  {editError && (
                    <p role="alert" className="text-sm text-rust">
                      {editError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => removePayment(p)}
                      className="border border-rust/40 text-rust bg-white px-3 py-2 rounded-lg text-sm active:scale-95 transition"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex-1 border border-line bg-white text-ink px-3 py-2 rounded-lg text-sm active:scale-95 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => savePayment(p)}
                      className="flex-1 bg-ledger text-paper px-3 py-2 rounded-lg text-sm font-medium active:scale-95 transition"
                    >
                      Save
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={p.id}
                  onClick={() => startEditing(p)}
                  className="bg-white border border-line rounded-lg px-3 py-3 flex justify-between items-center cursor-pointer active:bg-ledger-light/40 transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-ink">{repayVerb}</p>
                      <SyncDot status={p.syncStatus} />
                    </div>
                    <p className="font-mono text-xs text-muted mt-0.5 truncate">
                      {formatDate(p.date)}
                      {p.note ? ` · ${p.note}` : ""}
                    </p>
                  </div>
                  <p className={`font-mono text-sm font-medium flex-shrink-0 pl-3 ${accent}`}>
                    ₹{formatMoney(p.amount)}
                  </p>
                </li>
              )
            )}
          </ul>
        )}
      </section>

      {showEdit && (
        <LoanFormDialog
          loan={loan}
          paid={summary.paid}
          people={people}
          onClose={closeEdit}
          onDeleted={() => router.replace("/loans")}
        />
      )}
    </main>
  );
}

function SyncDot({ status }: { status: "synced" | "pending" | "error" }) {
  const color = status === "synced" ? "bg-ledger" : status === "pending" ? "bg-amber-500" : "bg-rust";
  const title = status === "synced" ? "Synced" : status === "pending" ? "Waiting to sync" : "Sync failed";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} title={title} />;
}
