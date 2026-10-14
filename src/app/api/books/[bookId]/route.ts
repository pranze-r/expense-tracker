import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ bookId: string }> };

// Renaming or deleting a book affects everyone who shares it, so only the
// owner may do either. Enforced here, not just by hiding the buttons.
async function isOwner(userId: string, bookId: string) {
  const membership = await prisma.bookMember.findUnique({
    where: { bookId_userId: { bookId, userId } },
  });
  return membership?.role === "OWNER";
}

// PATCH /api/books/:bookId  { name }
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;

  // Prisma treats `id: undefined` as "no filter" — never let a missing
  // param widen a query.
  if (!bookId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!(await isOwner(user.id, bookId))) {
    return NextResponse.json({ error: "Only the owner can rename this book" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Book name must be 1–60 characters" }, { status: 400 });
  }

  const book = await prisma.book.update({ where: { id: bookId }, data: { name } });
  return NextResponse.json(book);
}

// DELETE /api/books/:bookId
// The database cascades: members, categories, entries and invites for this
// book are removed with it.
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;
  if (!bookId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!(await isOwner(user.id, bookId))) {
    return NextResponse.json({ error: "Only the owner can delete this book" }, { status: 403 });
  }

  await prisma.book.deleteMany({ where: { id: bookId } });
  return NextResponse.json({ ok: true });
}
