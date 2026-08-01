import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ bookId: string }> };

// GET /api/books/:bookId/transactions
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;
  const transactions = await prisma.transaction.findMany({
    where: { bookId },
    orderBy: { date: "desc" },
    include: { category: true },
  });
  return NextResponse.json(transactions);
}

// POST /api/books/:bookId/transactions
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;
  const body = await req.json();

  if (typeof body?.amount !== "number") {
    return NextResponse.json(
      { error: "amount (number) is required" },
      { status: 400 }
    );
  }

  const transaction = await prisma.transaction.create({
    data: {
      amount: body.amount,
      note: body.note ?? null,
      date: body.date ? new Date(body.date) : new Date(),
      bookId,
      categoryId: body.categoryId ?? null,
    },
  });

  return NextResponse.json(transaction, { status: 201 });
}
