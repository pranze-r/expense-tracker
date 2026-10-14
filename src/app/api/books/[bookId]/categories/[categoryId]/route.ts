import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ bookId: string; categoryId: string }> };

async function canEdit(userId: string, bookId: string) {
  const membership = await prisma.bookMember.findUnique({
    where: { bookId_userId: { bookId, userId } },
  });
  return !!membership && membership.role !== "VIEWER";
}

// PATCH /api/books/:bookId/categories/:categoryId  { name }
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { bookId, categoryId } = await params;

  // Prisma treats `id: undefined` as "no filter" — never let a missing
  // param widen a query.
  if (!bookId || !categoryId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!(await canEdit(user.id, bookId))) {
    return NextResponse.json({ error: "You don't have permission to edit categories in this book" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 30) {
    return NextResponse.json({ error: "Category name must be 1–30 characters" }, { status: 400 });
  }

  const category = await prisma.category.findFirst({ where: { id: categoryId, bookId } });
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const duplicate = await prisma.category.findFirst({
    where: { bookId, id: { not: categoryId }, name: { equals: name, mode: "insensitive" } },
  });
  if (duplicate) {
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
  }

  const updated = await prisma.category.update({ where: { id: categoryId }, data: { name } });
  return NextResponse.json(updated);
}

// DELETE /api/books/:bookId/categories/:categoryId
// Entries that used it keep their amounts and notes — the database just
// clears their category.
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { bookId, categoryId } = await params;
  if (!bookId || !categoryId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!(await canEdit(user.id, bookId))) {
    return NextResponse.json({ error: "You don't have permission to delete categories in this book" }, { status: 403 });
  }

  // Already gone is fine — the end state the client wanted is achieved.
  await prisma.category.deleteMany({ where: { id: categoryId, bookId } });
  return NextResponse.json({ ok: true });
}
