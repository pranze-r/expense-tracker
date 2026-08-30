import Dexie, { type Table } from "dexie";

export type SyncStatus = "synced" | "pending" | "error";

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