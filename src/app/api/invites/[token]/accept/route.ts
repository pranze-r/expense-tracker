import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ token: string }> };

// POST /api/invites/:token/accept -> join the book this invite points to
export async function POST(_req: Request, { params }: RouteParams) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const invite = await prisma.bookInvite.findUnique({ where: { token } });

  if (!invite) {
    return NextResponse.json({ error: "This invite link is invalid" }, { status: 404 });
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite link has expired" }, { status: 410 });
  }

  await prisma.bookMember.upsert({
    where: { bookId_userId: { bookId: invite.bookId, userId: user.id } },
    update: {}, // already a member — no-op, don't downgrade an existing OWNER/EDITOR
    create: { bookId: invite.bookId, userId: user.id, role: invite.role },
  });

  return NextResponse.json({ bookId: invite.bookId });
}
