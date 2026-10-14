import Dexie, { type Table } from "dexie";

export type SyncStatus = "synced" | "pending" | "error";
export type TransactionType = "DEBIT" | "CREDIT";
export type BookRole = "OWNER" | "EDITOR" | "VIEWER";

export interface LocalBook {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  transactionCount: number;
  // Your role in this book. Only OWNERs can rename or delete it. Missing on
  // books cached before this field existed — filled in on the next sync.
  myRole?: BookRole;
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

// A label for entries (Food, Transport…). Each book keeps its own list, so
// everyone sharing a book sees the same categories.
export interface LocalCategory {
  id: string;
  bookId: string;
  name: string;
  syncStatus: SyncStatus;
  syncError?: string;
}

export interface OutboxItem {
  id?: number;
  entity: "book" | "transaction" | "category";
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
  categories!: Table<LocalCategory, string>;
  outbox!: Table<OutboxItem, number>;

  constructor() {
    super("expense-tracker");
    this.version(1).stores({
      books: "id, updatedAt, syncStatus",
      transactions: "id, bookId, date, syncStatus",
      outbox: "++id, entity, entityId, createdAt",
    });
    // v2 adds the categories table. Existing devices upgrade in place —
    // nothing already stored is touched.
    this.version(2).stores({
      books: "id, updatedAt, syncStatus",
      transactions: "id, bookId, date, syncStatus",
      outbox: "++id, entity, entityId, createdAt",
      categories: "id, bookId",
    });
  }
}

export const db: AppDB | null = typeof window !== "undefined" ? new AppDB() : null;
