import { db, type LocalBook, type LocalTransaction } from "./db";

function nowIso() {
  return new Date().toISOString();
}
function newId() {
  return crypto.randomUUID();
}

export async function createBookLocal(name: string): Promise<string> {
  if (!db) throw new Error("Local database unavailable");
  const id = newId();
  const timestamp = nowIso();

  const book: LocalBook = {
    id, name, createdAt: timestamp, updatedAt: timestamp,
    memberCount: 1, transactionCount: 0, syncStatus: "pending",
  };

  await db.books.put(book);
  await db.outbox.add({
    entity: "book", entityId: id, url: "/api/books",
    payload: { id, name }, createdAt: timestamp, attempts: 0,
  });

  flushOutbox();
  return id;
}

export async function createTransactionLocal(
  bookId: string,
  input: { amount: number; note: string | null; date: string; categoryId: string | null }
): Promise<string> {
  if (!db) throw new Error("Local database unavailable");
  const id = newId();
  const timestamp = nowIso();

  const transaction: LocalTransaction = {
    id, bookId, amount: input.amount, note: input.note, date: input.date,
    categoryId: input.categoryId, categoryName: null,
    createdAt: timestamp, updatedAt: timestamp, syncStatus: "pending",
  };

  await db.transactions.put(transaction);

  const book = await db.books.get(bookId);
  if (book) await db.books.update(bookId, { transactionCount: book.transactionCount + 1 });

  await db.outbox.add({
    entity: "transaction", entityId: id, url: `/api/books/${bookId}/transactions`,
    payload: { id, ...input }, createdAt: timestamp, attempts: 0,
  });

  flushOutbox();
  return id;
}

export async function pullBooks() {
  if (!db) return;
  try {
    const res = await fetch("/api/books");
    if (!res.ok) return;
    const serverBooks: Array<{
      id: string; name: string; createdAt: string; updatedAt: string;
      _count: { transactions: number; members: number };
    }> = await res.json();

    for (const b of serverBooks) {
      const local = await db.books.get(b.id);
      if (local && local.syncStatus === "pending") continue;
      await db.books.put({
        id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt,
        memberCount: b._count.members, transactionCount: b._count.transactions,
        syncStatus: "synced",
      });
    }
  } catch {}
}

export async function pullTransactions(bookId: string) {
  if (!db) return;
  try {
    const res = await fetch(`/api/books/${bookId}/transactions`);
    if (!res.ok) return;
    const serverTx: Array<{
      id: string; amount: number; note: string | null; date: string;
      createdAt: string; updatedAt: string; category: { name: string } | null;
    }> = await res.json();

    for (const t of serverTx) {
      const local = await db.transactions.get(t.id);
      if (local && local.syncStatus === "pending") continue;
      await db.transactions.put({
        id: t.id, bookId, amount: t.amount, note: t.note, date: t.date,
        categoryId: null, categoryName: t.category?.name ?? null,
        createdAt: t.createdAt, updatedAt: t.updatedAt, syncStatus: "synced",
      });
    }
  } catch {}
}

let flushing = false;

export async function flushOutbox() {
  if (!db) return;
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  flushing = true;
  try {
    const items = await db.outbox.orderBy("createdAt").toArray();

    for (const item of items) {
      try {
        const res = await fetch(item.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });

        if (!res.ok) {
          const isPermanent = res.status >= 400 && res.status < 500;
          if (isPermanent) {
            const data = await res.json().catch(() => ({}));
            await markError(item.entity, item.entityId, data.error || `Request failed (${res.status})`);
            await db.outbox.delete(item.id!);
          } else {
            await db.outbox.update(item.id!, {
              attempts: item.attempts + 1,
              lastError: `Server error (${res.status})`,
            });
          }
          continue;
        }

        await markSynced(item.entity, item.entityId);
        await db.outbox.delete(item.id!);
      } catch {
        await db.outbox.update(item.id!, { attempts: item.attempts + 1 });
      }
    }
  } finally {
    flushing = false;
  }
}

async function markSynced(entity: "book" | "transaction", id: string) {
  if (!db) return;
  if (entity === "book") await db.books.update(id, { syncStatus: "synced" });
  else await db.transactions.update(id, { syncStatus: "synced" });
}

async function markError(entity: "book" | "transaction", id: string, message: string) {
  if (!db) return;
  if (entity === "book") await db.books.update(id, { syncStatus: "error", syncError: message });
  else await db.transactions.update(id, { syncStatus: "error", syncError: message });
}

export function startSync() {
  if (typeof window === "undefined") return;
  flushOutbox();
  pullBooks();

  const onOnline = () => flushOutbox();
  window.addEventListener("online", onOnline);
  const interval = setInterval(() => flushOutbox(), 15000);

  return () => {
    window.removeEventListener("online", onOnline);
    clearInterval(interval);
  };
}