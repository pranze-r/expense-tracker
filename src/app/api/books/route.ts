import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/books -> list books the logged-in user is a member of
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const books = await prisma.book.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { transactions: true, members: true } },
      // just this user's own membership, so the app knows their role
      members: { where: { userId: user.id }, select: { role: true } },
    },
  });

  return NextResponse.json(
    books.map(({ members, ...book }) => ({ ...book, myRole: members[0]?.role ?? null }))
  );
}

// POST /api/books -> create a new book, creator becomes OWNER
//
// Accepts an optional client-generated `id`. This is what makes offline
// creation work: the phone generates the id locally (so it can show the
// book in the UI immediately, no network needed), and when the outbox
// eventually syncs, we use `upsert` keyed on that id instead of `create` —
// so if the sync request gets retried (e.g. connection drops mid-request),
// the second attempt is a harmless no-op instead of a duplicate or an error.
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
