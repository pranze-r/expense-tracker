import type { LocalLoan, LocalLoanPayment } from "./db";

// 1,23,456.50 — Indian digit grouping, always two decimals
export function formatMoney(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

// <input type="date"> works with local "YYYY-MM-DD" strings
export function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Picked day -> ISO timestamp. Today keeps the current time (so same-day
// items stay in the order they were added); other days are pinned to local
// noon so a timezone shift can never move them to a neighbouring day.
export function dayToIso(value: string) {
  if (!value || value === toDateInput(new Date())) return new Date().toISOString();
  return new Date(`${value}T12:00:00`).toISOString();
}

// Always local noon — for due dates, which have no time of day
export function noonIso(value: string) {
  return new Date(`${value}T12:00:00`).toISOString();
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export interface LoanSummary {
  paid: number;
  remaining: number;
  settled: boolean;
  overdue: boolean;
  // Whole days past the due date (0 if not overdue)
  daysOverdue: number;
  // 0–100, how much of the loan has been paid back
  percentPaid: number;
}

export function summarize(loan: LocalLoan, payments: LocalLoanPayment[]): LoanSummary {
  const paid = round2(payments.reduce((sum, p) => sum + p.amount, 0));
  const remaining = Math.max(0, round2(loan.amount - paid));
  const settled = remaining <= 0;

  let daysOverdue = 0;
  if (!settled && loan.dueDate) {
    const todayNoon = new Date(`${toDateInput(new Date())}T12:00:00`).getTime();
    const dueNoon = new Date(`${toDateInput(new Date(loan.dueDate))}T12:00:00`).getTime();
    daysOverdue = Math.max(0, Math.round((todayNoon - dueNoon) / 86400000));
  }

  return {
    paid,
    remaining,
    settled,
    overdue: daysOverdue > 0,
    daysOverdue,
    percentPaid: loan.amount > 0 ? Math.min(100, Math.round((paid / loan.amount) * 100)) : 0,
  };
}

// "Overdue by 3 days" / "Due today" / "Due 12 Nov 2026" — null when there's nothing to say
export function dueText(loan: LocalLoan, s: LoanSummary): string | null {
  if (s.settled || !loan.dueDate) return null;
  if (s.overdue) return `Overdue by ${s.daysOverdue} day${s.daysOverdue === 1 ? "" : "s"}`;
  if (toDateInput(new Date(loan.dueDate)) === toDateInput(new Date())) return "Due today";
  return `Due ${formatDate(loan.dueDate)}`;
}
