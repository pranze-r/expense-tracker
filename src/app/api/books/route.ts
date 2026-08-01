import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/books -> list all books
// NOTE: once auth (Phase 3) is added, this will be scoped to the
// logged-in user's memberships instead of returning everything.
export async function GET() {
  const books = await prisma.book.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { transactions: true, members: true } },
    },
  });
  return NextResponse.json(books);
}

// POST /api/books -> create a new book
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "Book name is required" },
      { status: 400 }
    );
  }

  const book = await prisma.book.create({
    data: { name: body.name },
  });

  return NextResponse.json(book, { status: 201 });
}
