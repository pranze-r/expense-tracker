import {
  db,
  type BookRole,
  type LocalBook,
  type LocalCategory,
  type LocalTransaction,
  type OutboxItem,
  type TransactionType,
} from "./db";

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

// Everything in the outbox that concerns one book: the book's own
// create/rename/delete, and any entries queued inside it.
function belongsToBook(item: OutboxItem, bookId: string) {
  return (
    (item.entity === "book" && item.entityId === bookId) ||
    item.url.startsWith(`/api/books/${bookId}/`)
  );
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
    myRole: "OWNER", // whoever creates a book owns it
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

  flushOutbox();
  return id;
}

export async function renameBookLocal(id: string, name: string) {
  if (!db) return;
  const timestamp = nowIso();

  await db.books.update(id, { name, updatedAt: timestamp, syncStatus: "pending" });

  // If this book's create (or an earlier rename) is still waiting in the
  // queue, fold the new name into it — one network call, final value only.
  const queued = await db.outbox
    .where({ entity: "book", entityId: id })
    .and((item) => item.method === "POST" || item.method === "PATCH")
    .first();

  if (queued) {
    await db.outbox.update(queued.id!, {
      payload: { ...(queued.payload as object), name },
    });
  } else {
    await db.outbox.add({
      entity: "book",
      entityId: id,
      method: "PATCH",
      url: `/api/books/${id}`,
      payload: { name },
      createdAt: timestamp,
      attempts: 0,
    });
  }

  flushOutbox();
}

// Removes a book, its entries, and everything queued for it from this
// device. Returns whether the book had ever been sent to the server.
async function purgeBookLocal(id: string): Promise<{ hadPendingCreate: boolean }> {
  if (!db) return { hadPendingCreate: false };
  const store = db;

  const related = await store.outbox.filter((item) => belongsToBook(item, id)).toArray();

  await store.transaction("rw", store.books, store.transactions, store.categories, store.outbox, async () => {
    await store.outbox.bulkDelete(related.map((item) => item.id!));
    await store.transactions.where("bookId").equals(id).delete();
    await store.categories.where("bookId").equals(id).delete();
    await store.books.delete(id);
  });

  return {
    hadPendingCreate: related.some((item) => item.entity === "book" && item.method === "POST"),
  };
}

export async function deleteBookLocal(id: string) {
  if (!db) return;

  const { hadPendingCreate } = await purgeBookLocal(id);

  // A book that never reached the server has nothing to delete there —
  // wiping it locally (and dropping its queued create) is the whole job.
  if (hadPendingCreate) return;

  await db.outbox.add({
    entity: "book",
    entityId: id,
    method: "DELETE",
    url: `/api/books/${id}`,
    payload: null,
    createdAt: nowIso(),
    attempts: 0,
  });

  flushOutbox();
}

// You left the book (or were removed from it): wipe it from this device
// without telling the server anything — the membership is already gone there.
export async function forgetBookLocal(id: string) {
  await purgeBookLocal(id);
}

export async function createTransactionLocal(
  bookId: string,
  input: {
    amount: number;
    type: TransactionType;
    note: string | null;
    date: string;
    categoryId: string | null;
  }
): Promise<string> {
  if (!db) throw new Error("Local database unavailable");
  const id = newId();
  const timestamp = nowIso();

  const transaction: LocalTransaction = {
    id,
    bookId,
    amount: input.amount,
    type: input.type,
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
  if (book) await db.books.update(bookId, { transactionCount: book.transactionCount + 1 });

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
  updates: {
    amount?: number;
    type?: TransactionType;
    note?: string | null;
    categoryId?: string | null;
  }
) {
  if (!db) return;
  const timestamp = nowIso();

  await db.transactions.update(id, { ...updates, updatedAt: timestamp, syncStatus: "pending" });

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

// ---------- Categories ----------

function cleanCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 30);
}

// Creates a category, or returns the existing one if this book already has
// one with that name (ignoring capitals) — typing "food" picks "Food".
export async function createCategoryLocal(bookId: string, rawName: string): Promise<string> {
  if (!db) throw new Error("Local database unavailable");
  const name = cleanCategoryName(rawName);
  if (!name) throw new Error("Category name is required");

  const existing = (await db.categories.where("bookId").equals(bookId).toArray()).find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing.id;

  const id = newId();
  await db.categories.put({ id, bookId, name, syncStatus: "pending" });
  await db.outbox.add({
    entity: "category",
    entityId: id,
    method: "POST",
    url: `/api/books/${bookId}/categories`,
    payload: { id, name },
    createdAt: nowIso(),
    attempts: 0,
  });

  flushOutbox();
  return id;
}

export const STARTER_CATEGORIES = ["Food", "Transport", "Bills", "Shopping", "Health", "Rent"];

// Adds whichever starter categories this book doesn't already have. They
// are ordinary categories from then on — rename or remove them freely.
export async function addStarterCategories(bookId: string) {
  for (const name of STARTER_CATEGORIES) {
    await createCategoryLocal(bookId, name); // skips names the book already has
  }
}

// Returns false (and changes nothing) if another category already has that name.
export async function renameCategoryLocal(bookId: string, id: string, rawName: string): Promise<boolean> {
  if (!db) return false;
  const name = cleanCategoryName(rawName);
  if (!name) return false;

  const siblings = await db.categories.where("bookId").equals(bookId).toArray();
  if (siblings.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) return false;

  await db.categories.update(id, { name, syncStatus: "pending" });

  const queued = await db.outbox
    .where({ entity: "category", entityId: id })
    .and((item) => item.method === "POST" || item.method === "PATCH")
    .first();

  if (queued) {
    await db.outbox.update(queued.id!, { payload: { ...(queued.payload as object), name } });
  } else {
    await db.outbox.add({
      entity: "category",
      entityId: id,
      method: "PATCH",
      url: `/api/books/${bookId}/categories/${id}`,
      payload: { name },
      createdAt: nowIso(),
      attempts: 0,
    });
  }

  flushOutbox();
  return true;
}

// Clears a category off every local entry that uses it — and off entry
// requests still waiting in the queue, which would otherwise be rejected
// for pointing at a category that no longer exists.
async function detachCategoryLocal(categoryId: string) {
  if (!db) return;
  const store = db;

  await store.transaction("rw", store.transactions, store.outbox, async () => {
    await store.transactions
      .filter((t) => t.categoryId === categoryId)
      .modify({ categoryId: null, categoryName: null });
    await store.outbox
      .filter(
        (item) =>
          item.entity === "transaction" &&
          (item.payload as { categoryId?: string | null } | null)?.categoryId === categoryId
      )
      .modify((item) => {
        (item.payload as { categoryId?: string | null }).categoryId = null;
      });
  });
}

export async function deleteCategoryLocal(bookId: string, id: string) {
  if (!db) return;
  const store = db;

  const related = await store.outbox
    .filter((item) => item.entity === "category" && item.entityId === id)
    .toArray();
  const neverReachedServer = related.some((item) => item.method === "POST");

  await detachCategoryLocal(id);
  await store.transaction("rw", store.categories, store.outbox, async () => {
    await store.outbox.bulkDelete(related.map((item) => item.id!));
    await store.categories.delete(id);
  });

  if (neverReachedServer) return; // the server never heard of it

  await store.outbox.add({
    entity: "category",
    entityId: id,
    method: "DELETE",
    url: `/api/books/${bookId}/categories/${id}`,
    payload: null,
    createdAt: nowIso(),
    attempts: 0,
  });

  flushOutbox();
}

// Two people can create the same category while offline. The server keeps
// the first and answers the second with "that already exists — here it is".
// We then switch over to the server's copy: entries (and queued entry
// requests) that pointed at ours are re-pointed, so nothing is lost.
async function adoptExistingCategory(
  bookId: string,
  oldId: string,
  existing: { id: string; name: string }
) {
  if (!db) return;
  const store = db;

  await store.transaction("rw", store.categories, store.transactions, store.outbox, async () => {
    await store.categories.put({ id: existing.id, bookId, name: existing.name, syncStatus: "synced" });
    if (existing.id !== oldId) await store.categories.delete(oldId);

    await store.transactions.filter((t) => t.categoryId === oldId).modify({ categoryId: existing.id });
    await store.outbox
      .filter(
        (item) =>
          item.entity === "transaction" &&
          (item.payload as { categoryId?: string | null } | null)?.categoryId === oldId
      )
      .modify((item) => {
        (item.payload as { categoryId?: string | null }).categoryId = existing.id;
      });

    // anything else still queued for our now-abandoned category (e.g. a rename)
    const leftovers = await store.outbox
      .filter((item) => item.entity === "category" && item.entityId === oldId)
      .primaryKeys();
    await store.outbox.bulkDelete(leftovers as number[]);
  });
}

// ---------- Pulling: shared plumbing ----------

export type PullResult = "ok" | "unauthorized" | "failed";

const inFlight = new Map<string, Promise<PullResult>>();

// Several parts of the app ask for the same data around the same moment
// (app start, the page that opens, a second page). They share one request
// instead of each making their own.
//
// `fresh` means "I just changed something — give me the server's current
// answer": it won't reuse a request that was already on its way before the
// change, it waits for that one and then asks again.
function coalesce(key: string, run: () => Promise<PullResult>, fresh = false): Promise<PullResult> {
  const running = inFlight.get(key);
  if (running && !fresh) return running;

  const start = (): Promise<PullResult> => {
    const promise: Promise<PullResult> = run().finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  };
  return running ? running.then(start, start) : start();
}

// A pull only writes the records that actually differ from what's stored.
// Rewriting identical records would still make every screen refresh.
const sameBook = (a: LocalBook, b: LocalBook) =>
  a.name === b.name &&
  a.createdAt === b.createdAt &&
  a.updatedAt === b.updatedAt &&
  a.memberCount === b.memberCount &&
  a.transactionCount === b.transactionCount &&
  a.myRole === b.myRole &&
  a.syncStatus === b.syncStatus &&
  a.syncError === b.syncError;

const sameTransaction = (a: LocalTransaction, b: LocalTransaction) =>
  a.amount === b.amount &&
  a.type === b.type &&
  a.note === b.note &&
  a.date === b.date &&
  a.categoryId === b.categoryId &&
  a.createdAt === b.createdAt &&
  a.updatedAt === b.updatedAt &&
  a.syncStatus === b.syncStatus &&
  a.syncError === b.syncError;

export function pullCategories(bookId: string, options?: { fresh?: boolean }) {
  return coalesce(`categories:${bookId}`, () => pullCategoriesNow(bookId), options?.fresh);
}

async function pullCategoriesNow(bookId: string): Promise<PullResult> {
  if (!db) return "failed";
  const store = db;
  try {
    // Same safety rule as books/entries: only categories already confirmed
    // on the server before this request are eligible for removal.
    const syncedBefore = (await store.categories
      .where("bookId")
      .equals(bookId)
      .filter((c) => c.syncStatus === "synced")
      .primaryKeys()) as string[];

    const res = await fetch(`/api/books/${bookId}/categories`);
    if (res.status === 401) return "unauthorized";
    if (!res.ok) return "failed";
    const serverCategories: Array<{ id: string; name: string }> = await res.json();

    await store.transaction("rw", store.categories, async () => {
      const locals = await store.categories.bulkGet(serverCategories.map((c) => c.id));
      const changed: LocalCategory[] = [];
      serverCategories.forEach((c, i) => {
        const local = locals[i];
        if (local && local.syncStatus === "pending") return;
        if (!local || local.name !== c.name || local.syncStatus !== "synced" || local.bookId !== bookId) {
          changed.push({ id: c.id, bookId, name: c.name, syncStatus: "synced" });
        }
      });
      if (changed.length > 0) await store.categories.bulkPut(changed);
    });

    const serverIds = new Set(serverCategories.map((c) => c.id));
    for (const id of syncedBefore) {
      if (serverIds.has(id)) continue;
      const local = await store.categories.get(id);
      if (local && local.syncStatus === "synced") {
        await detachCategoryLocal(id);
        await store.categories.delete(id);
      }
    }
    return "ok";
  } catch {
    // offline — the local copy stands
    return "failed";
  }
}

// ---------- Pulling server state down ----------
// Only overwrites local records that are already "synced" — a record with
// unsynced local changes ("pending") is left alone until the outbox clears
// it, so a slow pull can never clobber something you just typed offline.
//
// It also removes local copies of things the server no longer has (deleted
// on another device, or you were removed from the book). To be safe, only
// records that were already confirmed on the server BEFORE the request
// started are eligible — a record that finishes syncing while we wait for
// the answer can't be mistaken for a deleted one.

export function pullBooks(options?: { fresh?: boolean }) {
  return coalesce("books", pullBooksNow, options?.fresh);
}

async function pullBooksNow(): Promise<PullResult> {
  if (!db) return "failed";
  const store = db;
  try {
    const syncedBefore = (await store.books
      .where("syncStatus")
      .equals("synced")
      .primaryKeys()) as string[];

    const res = await fetch("/api/books");
    if (res.status === 401) return "unauthorized";
    if (!res.ok) return "failed";
    const serverBooks: Array<{
      id: string;
      name: string;
      createdAt: string;
      updatedAt: string;
      myRole: BookRole | null;
      _count: { transactions: number; members: number };
    }> = await res.json();

    // One read and (at most) one write for the whole list, in one transaction
    await store.transaction("rw", store.books, async () => {
      const locals = await store.books.bulkGet(serverBooks.map((b) => b.id));
      const changed: LocalBook[] = [];
      serverBooks.forEach((b, i) => {
        const local = locals[i];
        if (local && local.syncStatus === "pending") return; // unsynced local changes win
        const next: LocalBook = {
          id: b.id,
          name: b.name,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          memberCount: b._count.members,
          transactionCount: b._count.transactions,
          myRole: b.myRole ?? undefined,
          syncStatus: "synced",
        };
        if (!local || !sameBook(local, next)) changed.push(next);
      });
      if (changed.length > 0) await store.books.bulkPut(changed);
    });

    const serverIds = new Set(serverBooks.map((b) => b.id));
    for (const id of syncedBefore) {
      if (serverIds.has(id)) continue;
      const local = await store.books.get(id);
      if (local && local.syncStatus === "synced") await purgeBookLocal(id);
    }
    return "ok";
  } catch {
    // offline — the local copy we already have is the best we can do
    return "failed";
  }
}

export function pullTransactions(bookId: string, options?: { fresh?: boolean }) {
  return coalesce(`transactions:${bookId}`, () => pullTransactionsNow(bookId), options?.fresh);
}

async function pullTransactionsNow(bookId: string): Promise<PullResult> {
  if (!db) return "failed";
  const store = db;
  try {
    const syncedBefore = (await store.transactions
      .where("bookId")
      .equals(bookId)
      .filter((t) => t.syncStatus === "synced")
      .primaryKeys()) as string[];

    const res = await fetch(`/api/books/${bookId}/transactions`);
    if (res.status === 401) return "unauthorized";
    if (!res.ok) return "failed";
    const serverTx: Array<{
      id: string;
      amount: number;
      type: TransactionType;
      note: string | null;
      date: string;
      createdAt: string;
      updatedAt: string;
      categoryId: string | null;
    }> = await res.json();

    // Everything below happens in ONE transaction: a single read of what we
    // already have, one write of only what changed, and the removals. Doing
    // this entry-by-entry took seconds for a book with a thousand entries,
    // and refreshed the screen once per entry.
    await store.transaction("rw", store.transactions, store.books, async () => {
      const locals = await store.transactions.bulkGet(serverTx.map((t) => t.id));
      const changed: LocalTransaction[] = [];
      serverTx.forEach((t, i) => {
        const local = locals[i];
        if (local && local.syncStatus === "pending") return; // unsynced local changes win
        const next: LocalTransaction = {
          id: t.id,
          bookId,
          amount: t.amount,
          type: t.type ?? "DEBIT",
          note: t.note,
          date: t.date,
          categoryId: t.categoryId ?? null,
          categoryName: null, // shown from the local categories list instead
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          syncStatus: "synced",
        };
        if (!local || !sameTransaction(local, next)) changed.push(next);
      });
      if (changed.length > 0) await store.transactions.bulkPut(changed);

      // Entries deleted elsewhere (only ones already confirmed on the server
      // before this request, as explained at the top of this section)
      const serverIds = new Set(serverTx.map((t) => t.id));
      const missing = syncedBefore.filter((id) => !serverIds.has(id));
      if (missing.length > 0) {
        const missingLocals = await store.transactions.bulkGet(missing);
        const toDelete = missing.filter((_, i) => missingLocals[i]?.syncStatus === "synced");
        if (toDelete.length > 0) await store.transactions.bulkDelete(toDelete);
      }

      // Keep the book's entry count honest — only write if it changed
      const count = await store.transactions.where("bookId").equals(bookId).count();
      const book = await store.books.get(bookId);
      if (book && book.transactionCount !== count) {
        await store.books.update(bookId, { transactionCount: count });
      }
    });
    return "ok";
  } catch {
    // offline — fine, local data stands
    return "failed";
  }
}

// ---------- Flushing the outbox ----------
// Processes queued writes in the order they were created. One item's
// failure doesn't block the rest — each is tried independently.

let flushing: Promise<void> | null = null;
let flushAgain = false;

// One pass at a time. If another is requested while one is running — say
// you add an entry mid-sync — the running one goes round again when it
// finishes, so the new item doesn't have to wait for the next 15-second tick.
//
// The returned promise settles only when everything queued so far has been
// attempted, so a caller that must not proceed until then (like leaving a
// book) can simply await it.
export function flushOutbox(): Promise<void> {
  if (!db) return Promise.resolve();
  if (flushing) {
    flushAgain = true;
    return flushing;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return Promise.resolve();

  flushing = (async () => {
    try {
      do {
        flushAgain = false;
        await flushPass();
      } while (flushAgain);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

async function flushPass() {
  if (!db) return;
  const snapshot = await db.outbox.orderBy("createdAt").toArray();

  for (const queued of snapshot) {
    // Re-read the item: it may have been edited (a rename folded into it)
    // or cancelled (its book was deleted) since the snapshot was taken.
    const item = await db.outbox.get(queued.id!);
    if (!item) continue;

    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.method === "DELETE" ? undefined : { "Content-Type": "application/json" },
        body: item.method === "DELETE" ? undefined : JSON.stringify(item.payload),
      });

      if (!res.ok) {
        if (res.status === 409 && item.entity === "category" && item.method === "POST") {
          const data = await res.json().catch(() => ({}));
          const bookId = item.url.match(/^\/api\/books\/([^/]+)\/categories/)?.[1];
          if (bookId && data.existing?.id) {
            await adoptExistingCategory(bookId, item.entityId, data.existing);
            await db.outbox.delete(item.id!);
            continue;
          }
        }

        // 4xx = the server rejected it for a reason a retry won't fix
        // (e.g. no longer a member of the book). Surface it, stop retrying.
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

      if (item.method !== "DELETE") await markSynced(item.entity, item.entityId);
      await db.outbox.delete(item.id!);
    } catch {
      // network failure mid-request — leave it queued, try again next time
      await db.outbox.update(item.id!, { attempts: item.attempts + 1 });
    }
  }
}

async function markSynced(entity: OutboxItem["entity"], id: string) {
  if (!db) return;
  if (entity === "book") await db.books.update(id, { syncStatus: "synced" });
  else if (entity === "category") await db.categories.update(id, { syncStatus: "synced" });
  else await db.transactions.update(id, { syncStatus: "synced" });
}

async function markError(entity: OutboxItem["entity"], id: string, message: string) {
  if (!db) return;
  if (entity === "book") await db.books.update(id, { syncStatus: "error", syncError: message });
  else if (entity === "category") await db.categories.update(id, { syncStatus: "error", syncError: message });
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
