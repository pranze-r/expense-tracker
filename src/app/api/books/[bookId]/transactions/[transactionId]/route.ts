import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ bookId: string; transactionId: string }> };

async function requireEditAccess(userId: string, bookId: string) {
  const membership = await prisma.bookMember.findUnique({
    where: { bookId_userId: { bookId, userId } },
  });
  return membership && membership.role !== "VIEWER";
}

// PATCH /api/books/:bookId/transactions/:transactionId
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { bookId, transactionId } = await params;

  // Prisma treats `id: undefined` as "no filter", which would turn this
  // into an update of every row in the book. Refuse instead.
  if (!bookId || !transactionId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!(await requireEditAccess(user.id, bookId))) {
    return NextResponse.json({ error: "You don't have permission to edit transactions in this book" }, { status: 403 });
  }

  const body = await req.json();
  const data: {
    amount?: number;
    type?: "DEBIT" | "CREDIT";
    note?: string | null;
    categoryId?: string | null;
  } = {};
  if (typeof body.amount === "number") data.amount = body.amount;
  if (body.type === "DEBIT" || body.type === "CREDIT") data.type = body.type;
  if ("note" in body) data.note = body.note;
  if ("categoryId" in body) data.categoryId = body.categoryId;

  if (typeof data.categoryId === "string") {
    const category = await prisma.category.findFirst({ where: { id: data.categoryId, bookId } });
    if (!category) {
      return NextResponse.json({ error: "Category not found in this book" }, { status: 400 });
    }
  }

  const result = await prisma.transaction.updateMany({
    where: { id: transactionId, bookId },
    data,
  });
  if (result.count === 0) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { category: true },
  });
  return NextResponse.json(transaction);
}

// DELETE /api/books/:bookId/transactions/:transactionId
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { bookId, transactionId } = await params;

  if (!bookId || !transactionId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!(await requireEditAccess(user.id, bookId))) {
    return NextResponse.json({ error: "You don't have permission to delete transactions in this book" }, { status: 403 });
  }

  // Already gone (e.g. deleted from another device) is fine — the end
  // state the client wanted is achieved either way.
  await prisma.transaction.deleteMany({ where: { id: transactionId, bookId } });
  return NextResponse.json({ ok: true });
}
