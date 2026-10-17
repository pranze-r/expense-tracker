import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ bookId: string; userId: string }> };

// PATCH /api/books/:bookId/members/:userId  { role: "EDITOR" | "VIEWER" | "OWNER" }
//
// Only the owner can change roles. A book always has exactly one owner, so
// "OWNER" means handing the book over: the target becomes the owner and the
// current owner becomes an editor, together or not at all.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { bookId, userId: targetId } = await params;

  // Prisma treats `undefined` as "no filter" — never let a missing param
  // widen a query.
  if (!bookId || !targetId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const me = await prisma.bookMember.findUnique({
    where: { bookId_userId: { bookId, userId: user.id } },
  });
  if (!me || me.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can change roles" }, { status: 403 });
  }

  if (targetId === user.id) {
    return NextResponse.json(
      { error: "You can't change your own role. To hand over the book, make someone else the owner." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const role = body?.role;
  if (role !== "EDITOR" && role !== "VIEWER" && role !== "OWNER") {
    return NextResponse.json({ error: "Role must be EDITOR, VIEWER or OWNER" }, { status: 400 });
  }

  const target = await prisma.bookMember.findUnique({
    where: { bookId_userId: { bookId, userId: targetId } },
  });
  if (!target) return NextResponse.json({ error: "That person isn't in this book" }, { status: 404 });

  if (role === "OWNER") {
    await prisma.$transaction([
      prisma.bookMember.update({
        where: { bookId_userId: { bookId, userId: targetId } },
        data: { role: "OWNER" },
      }),
      prisma.bookMember.update({
        where: { bookId_userId: { bookId, userId: user.id } },
        data: { role: "EDITOR" },
      }),
    ]);
    return NextResponse.json({ ok: true, transferred: true });
  }

  await prisma.bookMember.update({
    where: { bookId_userId: { bookId, userId: targetId } },
    data: { role },
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/books/:bookId/members/:userId
//  - your own id  -> you leave the book (owners can't: hand it over first)
//  - someone else -> the owner removes them
// Their past entries stay in the book either way.
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { bookId, userId: targetId } = await params;
  if (!bookId || !targetId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const me = await prisma.bookMember.findUnique({
    where: { bookId_userId: { bookId, userId: user.id } },
  });

  if (targetId === user.id) {
    if (!me) return NextResponse.json({ ok: true }); // already gone
    if (me.role === "OWNER") {
      return NextResponse.json(
        { error: "As the owner you can't leave. Make someone else the owner first, or delete the book." },
        { status: 400 }
      );
    }
  } else if (!me || me.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can remove people" }, { status: 403 });
  }

  // Already gone is fine — the end state the client wanted is achieved.
  await prisma.bookMember.deleteMany({ where: { bookId, userId: targetId } });
  return NextResponse.json({ ok: true });
}
