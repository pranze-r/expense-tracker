import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ bookId: string }> };

// POST /api/books/:bookId/invites -> create a new shareable join link
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const membership = await prisma.bookMember.findUnique({
    where: { bookId_userId: { bookId, userId: user.id } },
  });

  if (!membership || membership.role === "VIEWER") {
    return NextResponse.json(
      { error: "You don't have permission to invite people to this book" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const role = body?.role === "VIEWER" ? "VIEWER" : "EDITOR"; // default EDITOR, never invite as OWNER

  const invite = await prisma.bookInvite.create({
    data: { bookId, role },
  });

  return NextResponse.json(invite, { status: 201 });
}
