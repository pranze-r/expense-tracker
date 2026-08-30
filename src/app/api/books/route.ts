import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const books = await prisma.book.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { transactions: true, members: true } } },
  });
  return NextResponse.json(books);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "Book name is required" }, { status: 400 });
  }

  const book = body.id
    ? await prisma.book.upsert({
        where: { id: body.id },
        update: {},
        create: { id: body.id, name: body.name, members: { create: { userId: user.id, role: "OWNER" } } },
        include: { _count: { select: { transactions: true, members: true } } },
      })
    : await prisma.book.create({
        data: { name: body.name, members: { create: { userId: user.id, role: "OWNER" } } },
        include: { _count: { select: { transactions: true, members: true } } },
      });

  return NextResponse.json(book, { status: 201 });
}