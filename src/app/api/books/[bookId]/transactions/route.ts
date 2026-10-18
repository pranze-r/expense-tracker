import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ bookId: string }> };

async function requireMembership(userId: string, bookId: string) {
  return prisma.bookMember.findUnique({ where: { bookId_userId: { bookId, userId } } });
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const membership = await requireMembership(user.id, bookId);
  if (!membership) return NextResponse.json({ error: "Not a member of this book" }, { status: 403 });

  // Only what the app uses — no join to the category table (the app shows
  // category names from its own local list), and fewer fields per entry.
  const transactions = await prisma.transaction.findMany({
    where: { bookId },
    orderBy: { date: "desc" },
    select: {
      id: true,
      amount: true,
      type: true,
      note: true,
      date: true,
      createdAt: true,
      updatedAt: true,
      categoryId: true,
    },
  });
  return NextResponse.json(transactions);
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const membership = await requireMembership(user.id, bookId);
  if (!membership || membership.role === "VIEWER") {
    return NextResponse.json({ error: "You don't have permission to add transactions to this book" }, { status: 403 });
  }

  const body = await req.json();
  if (typeof body?.amount !== "number") {
    return NextResponse.json({ error: "amount (number) is required" }, { status: 400 });
  }

  // An entry can only use a category that belongs to this same book
  if (body.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: body.categoryId, bookId } });
    if (!category) {
      return NextResponse.json({ error: "Category not found in this book" }, { status: 400 });
    }
  }

  const data = {
    amount: body.amount,
    // Anything other than an explicit CREDIT is stored as a DEBIT
    type: (body.type === "CREDIT" ? "CREDIT" : "DEBIT") as "CREDIT" | "DEBIT",
    note: body.note ?? null,
    date: body.date ? new Date(body.date) : new Date(),
    bookId,
    categoryId: body.categoryId ?? null,
    createdByUserId: user.id,
  };

  const transaction = body.id
    ? await prisma.transaction.upsert({
        where: { id: body.id }, update: {}, create: { id: body.id, ...data }, include: { category: true },
      })
    : await prisma.transaction.create({ data, include: { category: true } });

  return NextResponse.json(transaction, { status: 201 });
}
