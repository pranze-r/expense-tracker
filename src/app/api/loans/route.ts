import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// Loans are personal: every query below is scoped to the logged-in user.

// GET /api/loans -> all of the user's loans, each with its repayments
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const loans = await prisma.loan.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    include: { payments: { orderBy: { date: "asc" } } },
  });
  return NextResponse.json(loans);
}

function parseDate(value: unknown): Date | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

// POST /api/loans -> record a new loan. Accepts a client-generated `id` and
// upserts on it, so a retried offline sync is a harmless no-op.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const person = typeof body?.person === "string" ? body.person.trim() : "";
  if (!person) return NextResponse.json({ error: "Person's name is required" }, { status: 400 });
  if (typeof body.amount !== "number" || !(body.amount > 0)) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }
  if (body.direction !== "LENT" && body.direction !== "BORROWED") {
    return NextResponse.json({ error: "direction must be LENT or BORROWED" }, { status: 400 });
  }

  const date = body.date ? parseDate(body.date) : new Date();
  const dueDate = parseDate(body.dueDate);
  if (!date || dueDate === undefined) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const data = {
    person: person.slice(0, 60),
    direction: body.direction as "LENT" | "BORROWED",
    amount: body.amount,
    note: body.note ?? null,
    date,
    dueDate,
    userId: user.id,
  };

  if (body.id) {
    // Never let someone upsert onto another user's loan id
    const existing = await prisma.loan.findUnique({ where: { id: body.id }, select: { userId: true } });
    if (existing && existing.userId !== user.id) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    }
  }

  const loan = body.id
    ? await prisma.loan.upsert({
        where: { id: body.id },
        update: {},
        create: { id: body.id, ...data },
        include: { payments: true },
      })
    : await prisma.loan.create({ data, include: { payments: true } });

  return NextResponse.json(loan, { status: 201 });
}
