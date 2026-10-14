import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ bookId: string }> };

async function getMembership(userId: string, bookId: string) {
  return prisma.bookMember.findUnique({ where: { bookId_userId: { bookId, userId } } });
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

// GET /api/books/:bookId/categories
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;
  if (!bookId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!(await getMembership(user.id, bookId))) {
    return NextResponse.json({ error: "Not a member of this book" }, { status: 403 });
  }

  const categories = await prisma.category.findMany({ where: { bookId }, orderBy: { name: "asc" } });
  return NextResponse.json(categories);
}

// POST /api/books/:bookId/categories  { id?, name }
//
// Like books and entries, the phone may supply its own id so a category can
// be created offline — a retried request with the same id is a harmless no-op.
//
// Two people can create "Food" at the same time while offline. Names are
// unique per book (ignoring capitals), so the second one gets a 409 that
// includes the category that already exists; the app switches over to it.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { bookId } = await params;
  if (!bookId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const membership = await getMembership(user.id, bookId);
  if (!membership || membership.role === "VIEWER") {
    return NextResponse.json({ error: "You don't have permission to add categories to this book" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = cleanName(body?.name);
  if (!name || name.length > 30) {
    return NextResponse.json({ error: "Category name must be 1–30 characters" }, { status: 400 });
  }

  // Same id again (a retried request): return what's already there
  if (typeof body.id === "string") {
    const same = await prisma.category.findUnique({ where: { id: body.id } });
    if (same) {
      if (same.bookId !== bookId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      return NextResponse.json(same, { status: 200 });
    }
  }

  const findByName = () =>
    prisma.category.findFirst({ where: { bookId, name: { equals: name, mode: "insensitive" } } });

  const duplicate = await findByName();
  if (duplicate) {
    return NextResponse.json({ error: "A category with that name already exists", existing: duplicate }, { status: 409 });
  }

  try {
    const category = await prisma.category.create({
      data: { ...(typeof body.id === "string" ? { id: body.id } : {}), name, bookId },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    // Lost a race with another request creating the same name
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await findByName();
      if (existing) {
        return NextResponse.json({ error: "A category with that name already exists", existing }, { status: 409 });
      }
    }
    throw error;
  }
}
