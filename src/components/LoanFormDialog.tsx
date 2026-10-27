"use client";

import { useEffect, useState } from "react";
import type { LoanDirection, LocalLoan } from "@/lib/db";
import { createLoanLocal, deleteLoanLocal, editLoanLocal } from "@/lib/sync";
import { dayToIso, formatMoney, noonIso, round2, toDateInput } from "@/lib/loanUtils";

const inputClass =
  "w-full border border-line bg-paper rounded-lg px-3 py-2.5 text-base text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ledger/40 focus:border-ledger";

// Add a new loan, or (when `loan` is given) edit / delete an existing one.
export default function LoanFormDialog({
  loan,
  paid = 0,
  people,
  defaultDirection = "LENT",
  onClose,
  onSaved,
  onDeleted,
}: {
  loan?: LocalLoan;
  // How much has already been paid back — the amount can't go below this
  paid?: number;
  // Names already used, offered as suggestions while typing
  people: string[];
  defaultDirection?: LoanDirection;
  onClose: () => void;
  onSaved?: () => void;
  onDeleted?: () => void;
}) {
  const editing = !!loan;
  const originalDay = loan ? toDateInput(new Date(loan.date)) : "";

  const [direction, setDirection] = useState<LoanDirection>(loan?.direction ?? defaultDirection);
  const [person, setPerson] = useState(loan?.person ?? "");
  const [amount, setAmount] = useState(loan ? String(loan.amount) : "");
  const [date, setDate] = useState(loan ? originalDay : toDateInput(new Date()));
  const [dueDate, setDueDate] = useState(loan?.dueDate ? toDateInput(new Date(loan.dueDate)) : "");
  const [note, setNote] = useState(loan?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Escape closes the popup; the page behind doesn't scroll underneath it
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = person.trim();
    const value = round2(parseFloat(amount));
    if (!name) return setError("Enter the person's name.");
    if (!(value > 0)) return setError("Enter an amount greater than 0.");
    if (editing && value < paid) {
      return setError(`₹${formatMoney(paid)} has already been paid back, so the amount can't be lower than that.`);
    }
    if (dueDate && dueDate < date) return setError("The due date can't be before the loan date.");

    setSaving(true);
    try {
      if (loan) {
        await editLoanLocal(loan.id, {
          person: name,
          direction,
          amount: value,
          note: note.trim() || null,
          dueDate: dueDate ? noonIso(dueDate) : null,
          // Only touch the date if it changed, so the loan keeps its time
          ...(date !== originalDay ? { date: dayToIso(date) } : {}),
        });
      } else {
        await createLoanLocal({
          person: name,
          direction,
          amount: value,
          note: note.trim() || null,
          date: dayToIso(date),
          dueDate: dueDate ? noonIso(dueDate) : null,
        });
      }
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!loan) return;
    await deleteLoanLocal(loan.id);
    onDeleted?.();
    onClose();
  }

  const directionButton = (kind: LoanDirection, label: string, hint: string, activeClass: string) => {
    const active = direction === kind;
    return (
      <button
        type="button"
        onClick={() => setDirection(kind)}
        aria-pressed={active}
        className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition active:scale-[0.98] ${
          active ? activeClass : "border-line bg-white text-ink"
        }`}
      >
        <span className="block text-sm font-medium">{label}</span>
        <span className={`block text-xs ${active ? "opacity-80" : "text-muted"}`}>{hint}</span>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="loan-form-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm max-h-[92dvh] overflow-y-auto bg-white border border-line rounded-2xl p-6 shadow-2xl"
      >
        <h2 id="loan-form-title" className="font-display text-2xl text-ink mb-4">
          {editing ? "Edit loan" : "New loan"}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-2">
            {directionButton("LENT", "I lent", "They owe me", "border-ledger bg-ledger text-paper")}
            {directionButton("BORROWED", "I borrowed", "I owe them", "border-rust bg-rust text-paper")}
          </div>

          <div>
            <label htmlFor="loan-person" className="text-sm text-muted block mb-1">
              Person
            </label>
            <input
              id="loan-person"
              list="loan-people"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              placeholder="e.g. Rahul"
              maxLength={60}
              autoFocus={!editing}
              className={inputClass}
            />
            <datalist id="loan-people">
              {people.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="loan-amount" className="text-sm text-muted block mb-1">
              Amount (₹)
            </label>
            <input
              id="loan-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="loan-date" className="text-sm text-muted block mb-1">
                Date
              </label>
              <input
                id="loan-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor="loan-due" className="text-sm text-muted block mb-1">
                Due date <span className="text-xs">(optional)</span>
              </label>
              <input
                id="loan-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="loan-note" className="text-sm text-muted block mb-1">
              Note <span className="text-xs">(optional)</span>
            </label>
            <input
              id="loan-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. for the trip tickets"
              maxLength={200}
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-rust">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-line bg-white text-ink px-4 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-ledger text-paper px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 active:scale-95 transition"
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Add loan"}
            </button>
          </div>
        </form>

        {editing && (
          <div className="mt-5 pt-4 border-t border-line">
            {confirmDelete ? (
              <div>
                <p className="text-sm text-ink mb-2">
                  Delete this loan and all its repayments? This can&rsquo;t be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 border border-line bg-white text-ink px-3 py-2 rounded-lg text-sm active:scale-95 transition"
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex-1 bg-rust text-paper px-3 py-2 rounded-lg text-sm font-medium active:scale-95 transition"
                  >
                    Yes, delete
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-sm text-rust font-medium"
              >
                Delete loan
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
