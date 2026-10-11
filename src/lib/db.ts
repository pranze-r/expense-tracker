import Dexie, { type Table } from "dexie";

export type SyncStatus = "synced" | "pending" | "error";
export type TransactionType = "DEBIT" | "CREDIT";

export interface LocalBook {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  transactionCount: number;
  syncStatus: SyncStatus;
  syncError?: string;
}

export interface LocalTransaction {
  id: string;
  bookId: string;
  amount: number;
  // DEBIT = money out, CREDIT = money in. Entries saved before this field
  // existed have no value here — the UI treats anything that isn't CREDIT
  // as a debit, which matches how they were originally entered (expenses).
  type: TransactionType;
  note: string | null;
  date: string;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  syncError?: string;
}

export interface OutboxItem {
  id?: number;
  entity: "book" | "transaction";
  entityId: string;
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

class AppDB extends Dexie {
  books!: Table<LocalBook, string>;
  transactions!: Table<LocalTransaction, string>;
  outbox!: Table<OutboxItem, number>;

  constructor() {
    super("expense-tracker");
    this.version(1).stores({
      books: "id, updatedAt, syncStatus",
      transactions: "id, bookId, date, syncStatus",
      outbox: "++id, entity, entityId, createdAt",
    });
  }
}

export const db: AppDB | null = typeof window !== "undefined" ? new AppDB() : null;
