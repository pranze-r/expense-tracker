import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ loanId: string }> };

// PATCH /api/loans/:loanId -> edit a loan
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { loanId } = await params;
  if (!loanId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const data: {
    person?: string;
    direction?: "LENT" | "BORROWED";
    amount?: number;
    note?: string | null;
    date?: Date;
    dueDate?: Date | null;
  } = {};

  if (typeof body.person === "string") {
    const person = body.person.trim();
    if (!person) return NextResponse.json({ error: "Person's name is required" }, { status: 400 });
    data.person = person.slice(0, 60);
  }
  if (body.direction === "LENT" || body.direction === "BORROWED") data.direction = body.direction;
  if (typeof body.amount === "number") {
    if (!(body.amount > 0)) return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    data.amount = body.amount;
  }
  if ("note" in body) data.note = body.note;
  if (typeof body.date === "string") {
    const d = new Date(body.date);
    if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    data.date = d;
  }
  if ("dueDate" in body) {
    if (body.dueDate === null) data.dueDate = null;
    else {
      const d = new Date(body.dueDate);
      if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      data.dueDate = d;
    }
  }

  const result = await prisma.loan.updateMany({ where: { id: loanId, userId: user.id }, data });
  if (result.count === 0) return NextResponse.json({ error: "Loan not found" }, { status: 404 });

  const loan = await prisma.loan.findUnique({ where: { id: loanId }, include: { payments: true } });
  return NextResponse.json(loan);
}

// DELETE /api/loans/:loanId -> remove a loan (its repayments go with it)
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { loanId } = await params;
  if (!loanId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Already gone is fine — the end state the client wanted is the same
  await prisma.loan.deleteMany({ where: { id: loanId, userId: user.id } });
  return NextResponse.json({ ok: true });
}
