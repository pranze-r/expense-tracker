import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ bookId: string }> };

// GET /api/books/:bookId/members
// Everyone in a book can see who else is in it (name/email and role) —
// they were all invited into the same shared space.
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;
  if (!bookId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const me = await prisma.bookMember.findUnique({
    where: { bookId_userId: { bookId, userId: user.id } },
  });
  if (!me) return NextResponse.json({ error: "Not a member of this book" }, { status: 403 });

  const members = await prisma.bookMember.findMany({
    where: { bookId },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });

  const rank = { OWNER: 0, EDITOR: 1, VIEWER: 2 } as const;
  const result = members
    .map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      joinedAt: m.joinedAt,
      isMe: m.userId === user.id,
    }))
    .sort((a, b) => rank[a.role] - rank[b.role]);

  return NextResponse.json(result);
}
