import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ token: string }> };

// GET /api/invites/:token -> public-ish lookup, just enough info to show
// "You've been invited to join <book name>" before the user accepts
export async function GET(_req: Request, { params }: RouteParams) {
  const { token } = await params;

  const invite = await prisma.bookInvite.findUnique({
    where: { token },
    include: { book: { select: { name: true } } },
  });

  if (!invite) {
    return NextResponse.json({ error: "This invite link is invalid" }, { status: 404 });
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite link has expired" }, { status: 410 });
  }

  return NextResponse.json({ bookName: invite.book.name, role: invite.role });
}
