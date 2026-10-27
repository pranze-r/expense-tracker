"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type LoanDirection, type LocalLoan, type LocalLoanPayment } from "@/lib/db";
import { pullLoans } from "@/lib/sync";
import { dueText, formatDate, formatMoney, round2, summarize } from "@/lib/loanUtils";
import LoanFormDialog from "@/components/LoanFormDialog";

type DirectionFilter = "ALL" | LoanDirection;

export default function LoansPage() {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [direction, setDirection] = useState<DirectionFilter>("ALL");
  const [showSettled, setShowSettled] = useState(false);
  const [initialSyncDone, setInitialSyncDone] = useState(false);

  const loans = useLiveQuery(() => db?.loans.orderBy("date").reverse().toArray() ?? [], []);
  const payments = useLiveQuery(() => db?.loanPayments.toArray() ?? [], []);

  useEffect(() => {
    pullLoans()
      .then((result) => {
        if (result === "unauthorized") router.push("/login");
      })
      .finally(() => setInitialSyncDone(true));
  }, [router]);

  const closeAdd = useCallback(() => setShowAdd(false), []);

  // Each loan with what's been paid back so far
  const rows = useMemo(() => {
    if (!loans || !payments) return undefined;
    const byLoan = new Map<string, LocalLoanPayment[]>();
    for (const p of payments) {
      const list = byLoan.get(p.loanId);
      if (list) list.push(p);
      else byLoan.set(p.loanId, [p]);
    }
    return loans.map((loan) => ({ loan, summary: summarize(loan, byLoan.get(loan.id) ?? []) }));
  }, [loans, payments]);

  const totals = useMemo(() => {
    let toReceive = 0;
    let toPay = 0;
    for (const { loan, summary } of rows ?? []) {
      if (summary.settled) continue;
      if (loan.direction === "LENT") toReceive += summary.remaining;
      else toPay += summary.remaining;
    }
    return { toReceive: round2(toReceive), toPay: round2(toPay) };
  }, [rows]);

  const people = useMemo(
    () => Array.from(new Set((loans ?? []).map((l) => l.person))).sort((a, b) => a.localeCompare(b)),
    [loans]
  );

  const settledCount = (rows ?? []).filter((r) => r.summary.settled).length;

  const visible = useMemo(() => {
    const list = (rows ?? []).filter(
      (r) =>
        r.summary.settled === showSettled && (direction === "ALL" || r.loan.direction === direction)
    );
    if (showSettled) return list; // already newest first
    // Overdue first, then the soonest due date, then the rest newest first
    return [...list].sort((a, b) => {
      if (a.summary.overdue !== b.summary.overdue) return a.summary.overdue ? -1 : 1;
      if (a.loan.dueDate && b.loan.dueDate) return a.loan.dueDate.localeCompare(b.loan.dueDate);
      if (a.loan.dueDate) return -1;
      if (b.loan.dueDate) return 1;
      return 0;
    });
  }, [rows, showSettled, direction]);

  const loading = rows === undefined || (rows.length === 0 && !initialSyncDone);
  const net = round2(totals.toReceive - totals.toPay);

  const tab = (value: DirectionFilter, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setDirection(value)}
      aria-pressed={direction === value}
      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition active:scale-95 ${
        direction === value ? "bg-ink text-paper border-ink" : "bg-white text-ink border-line"
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="min-h-dvh flex flex-col pb-10">
      <header className="px-6 pt-6 pb-5">
        <Link href="/books" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition mb-4">
          <span className="font-mono">←</span> My Books
        </Link>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted mb-1">
              Personal · only you see this
            </p>
            <h1 className="font-display text-3xl text-ink">Lend &amp; Borrow</h1>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-ledger text-paper px-4 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition flex-shrink-0"
          >
            + New loan
          </button>
        </div>
      </header>

      <section className="px-6 mb-5" aria-label="Summary">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-ledger/30 bg-ledger-light px-4 py-3">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-muted">You&rsquo;ll get</p>
            <p className="font-display text-2xl text-ledger mt-1">₹{formatMoney(totals.toReceive)}</p>
          </div>
          <div className="rounded-xl border border-rust/30 bg-white px-4 py-3">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-muted">You owe</p>
            <p className="font-display text-2xl text-rust mt-1">₹{formatMoney(totals.toPay)}</p>
          </div>
        </div>
        {totals.toReceive > 0 && totals.toPay > 0 && (
          <p className="font-mono text-xs text-muted mt-2 text-center">
            Net: {net >= 0 ? "you'll get" : "you owe"} ₹{formatMoney(Math.abs(net))}
          </p>
        )}
      </section>

      <div className="px-6 mb-4">
        <div className="flex gap-2 mb-3">
          {tab("ALL", "All")}
          {tab("LENT", "I lent")}
          {tab("BORROWED", "I borrowed")}
        </div>
        <div className="flex gap-4 border-b border-line">
          {[
            { settled: false, label: "Active" },
            { settled: true, label: `Settled${settledCount ? ` (${settledCount})` : ""}` },
          ].map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setShowSettled(t.settled)}
              aria-pressed={showSettled === t.settled}
              className={`pb-2 text-sm font-medium -mb-px border-b-2 transition ${
                showSettled === t.settled ? "border-ledger text-ledger" : "border-transparent text-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-6">
        {loading ? (
          <p className="font-mono text-sm text-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="border border-dashed border-line rounded-xl p-8 text-center">
            <p className="text-ink font-medium mb-1">
              {rows && rows.length === 0
                ? "No loans yet"
                : showSettled
                  ? "Nothing settled yet"
                  : "Nothing to show here"}
            </p>
            <p className="text-muted text-sm mb-4">
              {rows && rows.length === 0
                ? "Record money you've lent or borrowed to keep track of it."
                : showSettled
                  ? "Loans move here once they're fully paid back."
                  : "Try a different filter, or add a new loan."}
            </p>
            {rows && rows.length === 0 && (
              <button
                onClick={() => setShowAdd(true)}
                className="bg-ledger text-paper px-4 py-2.5 rounded-lg text-sm font-medium active:scale-95 transition"
              >
                + New loan
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map(({ loan, summary }) => (
              <LoanCard key={loan.id} loan={loan} summary={summary} />
            ))}
          </ul>
        )}
      </div>

      {showAdd && (
        <LoanFormDialog
          people={people}
          defaultDirection={direction === "BORROWED" ? "BORROWED" : "LENT"}
          onClose={closeAdd}
        />
      )}
    </main>
  );
}

function LoanCard({ loan, summary }: { loan: LocalLoan; summary: ReturnType<typeof summarize> }) {
  const lent = loan.direction === "LENT";
  const due = dueText(loan, summary);

  return (
    <li>
      <Link
        href={`/loans/${loan.id}`}
        className="block bg-white border border-line rounded-lg px-3 py-3 active:bg-ledger-light/40 transition"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-ink truncate">{loan.person}</p>
              <SyncDot status={loan.syncStatus} />
            </div>
            <p className="mt-1">
              <span
                className={`inline-block font-mono text-[11px] px-1.5 py-0.5 rounded ${
                  lent ? "bg-ledger-light text-ledger" : "bg-rust/10 text-rust"
                }`}
              >
                {lent ? "You lent" : "You borrowed"}
              </span>
              <span className="font-mono text-xs text-muted ml-2">{formatDate(loan.date)}</span>
            </p>
            {loan.note && <p className="text-xs text-muted mt-1 truncate">{loan.note}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            {summary.settled ? (
              <p className="font-mono text-sm text-muted">Settled</p>
            ) : (
              <p className={`font-mono text-sm font-medium ${lent ? "text-ledger" : "text-rust"}`}>
                ₹{formatMoney(summary.remaining)}
              </p>
            )}
            <p className="font-mono text-[11px] text-muted mt-0.5">of ₹{formatMoney(loan.amount)}</p>
          </div>
        </div>

        {summary.paid > 0 && (
          <div
            className="mt-2 h-1.5 rounded-full bg-line overflow-hidden"
            role="progressbar"
            aria-label="Paid back"
            aria-valuenow={summary.percentPaid}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full ${lent ? "bg-ledger" : "bg-rust"}`}
              style={{ width: `${summary.percentPaid}%` }}
            />
          </div>
        )}

        {due && (
          <p className={`font-mono text-xs mt-2 ${summary.overdue ? "text-rust font-medium" : "text-muted"}`}>
            {due}
          </p>
        )}
      </Link>
    </li>
  );
}

function SyncDot({ status }: { status: "synced" | "pending" | "error" }) {
  const color = status === "synced" ? "bg-ledger" : status === "pending" ? "bg-amber-500" : "bg-rust";
  const title = status === "synced" ? "Synced" : status === "pending" ? "Waiting to sync" : "Sync failed";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} title={title} />;
}
