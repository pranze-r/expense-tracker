import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ bookId: string }> };

const INVITE_LIFETIME_DAYS = 7;

// POST /api/books/:bookId/invites  { role?: "EDITOR" | "VIEWER" }
// Creates a shareable join link. Links expire after a week, and the owner
// can revoke them all at once (see DELETE below).
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;
  if (!bookId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const membership = await prisma.bookMember.findUnique({
    where: { bookId_userId: { bookId, userId: user.id } },
  });
  if (!membership || membership.role === "VIEWER") {
    return NextResponse.json({ error: "You don't have permission to invite people to this book" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const role = body?.role === "VIEWER" ? "VIEWER" : "EDITOR"; // never invite as OWNER

  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  const invite = await prisma.bookInvite.create({ data: { bookId, role, expiresAt } });
  return NextResponse.json(invite, { status: 201 });
}

// DELETE /api/books/:bookId/invites -> revoke every invite link for this book
// (owner only). Removing someone doesn't stop them rejoining with a link
// they still have — this does.
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;
  if (!bookId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const membership = await prisma.bookMember.findUnique({
    where: { bookId_userId: { bookId, userId: user.id } },
  });
  if (!membership || membership.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can revoke invite links" }, { status: 403 });
  }

  const result = await prisma.bookInvite.deleteMany({ where: { bookId } });
  return NextResponse.json({ ok: true, revoked: result.count });
}
