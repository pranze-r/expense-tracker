import { db, type LocalBook, type LocalTransaction } from "./db";

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

// ---------- Local-first writes ----------
// These resolve instantly (no network wait) so the UI can update right away,
// whether you're online or not.

export async function createBookLocal(name: string): Promise<string> {
  if (!db) throw new Error("Local database unavailable");

  const id = newId();
  const timestamp = nowIso();

  const book: LocalBook = {
    id,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    memberCount: 1,
    transactionCount: 0,
    syncStatus: "pending",
  };

  await db.books.put(book);
  await db.outbox.add({
    entity: "book",
    entityId: id,
    method: "POST",
    url: "/api/books",
    payload: { id, name },
    createdAt: timestamp,
    attempts: 0,
  });

  flushOutbox(); // fire and forget — don't block the caller on network
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
    id,
    bookId,
    amount: input.amount,
    note: input.note,
    date: input.date,
    categoryId: input.categoryId,
    categoryName: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: "pending",
  };

  await db.transactions.put(transaction);

  const book = await db.books.get(bookId);
  if (book) {
    await db.books.update(bookId, { transactionCount: book.transactionCount + 1 });
  }

  await db.outbox.add({
    entity: "transaction",
    entityId: id,
    method: "POST",
    url: `/api/books/${bookId}/transactions`,
    payload: { id, ...input },
    createdAt: timestamp,
    attempts: 0,
  });

  flushOutbox();
  return id;
}

export async function editTransactionLocal(
  bookId: string,
  id: string,
  updates: { amount?: number; note?: string | null; categoryId?: string | null }
) {
  if (!db) return;
  const timestamp = nowIso();

  await db.transactions.update(id, { ...updates, updatedAt: timestamp, syncStatus: "pending" });

  // If this transaction hasn't synced even once yet, its outbox item is
  // still the original "create" request. Rather than queue a second
  // request behind it, just fold the edit into that same payload — the
  // create request that eventually fires will already carry the final
  // values, so there's only ever one network call for this record.
  const pendingCreate = await db.outbox
    .where({ entity: "transaction", entityId: id })
    .and((item) => item.method === "POST")
    .first();

  if (pendingCreate) {
    await db.outbox.update(pendingCreate.id!, {
      payload: { ...(pendingCreate.payload as object), ...updates },
    });
  } else {
    await db.outbox.add({
      entity: "transaction",
      entityId: id,
      method: "PATCH",
      url: `/api/books/${bookId}/transactions/${id}`,
      payload: updates,
      createdAt: timestamp,
      attempts: 0,
    });
  }

  flushOutbox();
}

export async function deleteTransactionLocal(bookId: string, id: string) {
  if (!db) return;

  await db.transactions.delete(id);
  const book = await db.books.get(bookId);
  if (book) {
    await db.books.update(bookId, { transactionCount: Math.max(0, book.transactionCount - 1) });
  }

  // If it never made it to the server in the first place, there's nothing
  // to delete remotely — just drop the queued create and we're done.
  const pendingCreate = await db.outbox
    .where({ entity: "transaction", entityId: id })
    .and((item) => item.method === "POST")
    .first();

  if (pendingCreate) {
    await db.outbox.delete(pendingCreate.id!);
    return;
  }

  await db.outbox.add({
    entity: "transaction",
    entityId: id,
    method: "DELETE",
    url: `/api/books/${bookId}/transactions/${id}`,
    payload: null,
    createdAt: nowIso(),
    attempts: 0,
  });

  flushOutbox();
}

// ---------- Pulling server state down ----------
// Only overwrites local records that are already "synced" — a record with
// unsynced local changes ("pending") is left alone until the outbox clears
// it, so a slow pull can never clobber something you just typed offline.

export async function pullBooks() {
  if (!db) return;
  try {
    const res = await fetch("/api/books");
    if (!res.ok) return;
    const serverBooks: Array<{
      id: string;
      name: string;
      createdAt: string;
      updatedAt: string;
      _count: { transactions: number; members: number };
    }> = await res.json();

    for (const b of serverBooks) {
      const local = await db.books.get(b.id);
      if (local && local.syncStatus === "pending") continue;

      await db.books.put({
        id: b.id,
        name: b.name,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        memberCount: b._count.members,
        transactionCount: b._count.transactions,
        syncStatus: "synced",
      });
    }
  } catch {
    // offline — the local copy we already have is the best we can do
  }
}

export async function pullTransactions(bookId: string) {
  if (!db) return;
  try {
    const res = await fetch(`/api/books/${bookId}/transactions`);
    if (!res.ok) return;
    const serverTx: Array<{
      id: string;
      amount: number;
      note: string | null;
      date: string;
      createdAt: string;
      updatedAt: string;
      category: { name: string } | null;
    }> = await res.json();

    for (const t of serverTx) {
      const local = await db.transactions.get(t.id);
      if (local && local.syncStatus === "pending") continue;

      await db.transactions.put({
        id: t.id,
        bookId,
        amount: t.amount,
        note: t.note,
        date: t.date,
        categoryId: null,
        categoryName: t.category?.name ?? null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        syncStatus: "synced",
      });
    }
  } catch {
    // offline — fine, local data stands
  }
}

// ---------- Flushing the outbox ----------
// Processes queued writes in the order they were created. One item's
// failure doesn't block the rest — each is tried independently.

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
          method: item.method,
          headers: item.method === "DELETE" ? undefined : { "Content-Type": "application/json" },
          body: item.method === "DELETE" ? undefined : JSON.stringify(item.payload),
        });

        if (!res.ok) {
          const isPermanent = res.status >= 400 && res.status < 500;
          if (isPermanent) {
            const data = await res.json().catch(() => ({}));
            if (item.method !== "DELETE") {
              await markError(item.entity, item.entityId, data.error || `Request failed (${res.status})`);
            }
            await db.outbox.delete(item.id!);
          } else {
            await db.outbox.update(item.id!, {
              attempts: item.attempts + 1,
              lastError: `Server error (${res.status})`,
            });
          }
          continue;
        }

        if (item.method !== "DELETE") {
          await markSynced(item.entity, item.entityId);
        }
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

// ---------- Boot the sync loop ----------
// Call once, high up in the component tree.

export function startSync() {
  if (typeof window === "undefined") return;

  flushOutbox();
  pullBooks();

  const onOnline = () => flushOutbox();
  window.addEventListener("online", onOnline);

  const interval = setInterval(() => {
    flushOutbox();
  }, 15000);

  return () => {
    window.removeEventListener("online", onOnline);
    clearInterval(interval);
  };
}